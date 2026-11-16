import type { GeoPoint } from "./vehicle-span.js";

export interface MapExtent {
  readonly east: number;
  readonly north: number;
  readonly south: number;
  readonly west: number;
}

export interface StreetTile {
  readonly height: string;
  readonly left: string;
  readonly src: string;
  readonly top: string;
  readonly width: string;
}

interface MapWindow {
  readonly east: number;
  readonly northT: number;
  readonly southT: number;
  readonly west: number;
}

const PAD = 0.1;
const MIN_ZOOM = 13;
const MAX_ZOOM = 18;
const MAX_SPAN_TILES = 4.05;
const MIN_SPAN = 0.001;

function mercator(lat: number): number {
  const radians = (lat * Math.PI) / 180;
  const sine = Math.sin(radians);
  return 0.5 - Math.log((1 + sine) / (1 - sine)) / (4 * Math.PI);
}

function percent(value: number): string {
  return `${value * 100}%`;
}

function mapWindow(extent: MapExtent): MapWindow {
  const latSpan = Math.max(extent.north - extent.south, MIN_SPAN);
  const lonSpan = Math.max(extent.east - extent.west, MIN_SPAN);
  const latPad = (latSpan * PAD) / (1 - PAD * 2);
  const lonPad = (lonSpan * PAD) / (1 - PAD * 2);
  return {
    east: extent.east + lonPad,
    northT: mercator(extent.north + latPad),
    southT: mercator(extent.south - latPad),
    west: extent.west - lonPad,
  };
}

function spanTiles(window: MapWindow, zoom: number): number {
  const scale = 2 ** zoom;
  const lonTiles = ((window.east - window.west) / 360) * scale;
  const latTiles = (window.southT - window.northT) * scale;
  return Math.max(lonTiles, latTiles);
}

function chooseZoom(window: MapWindow): number {
  let zoom = MIN_ZOOM;
  for (let candidate = MIN_ZOOM; candidate <= MAX_ZOOM; candidate += 1) {
    if (spanTiles(window, candidate) <= MAX_SPAN_TILES) {
      zoom = candidate;
    }
  }
  return zoom;
}

function tileBox(window: MapWindow, zoom: number, x: number, y: number): StreetTile {
  const scale = 2 ** zoom;
  const westT = (window.west + 180) / 360;
  const eastT = (window.east + 180) / 360;
  const widthT = eastT - westT;
  const heightT = window.southT - window.northT;
  return {
    height: percent(1 / scale / heightT),
    left: percent((x / scale - westT) / widthT),
    src: `/api/v1/map-tile?z=${zoom}&x=${x}&y=${y}`,
    top: percent((y / scale - window.northT) / heightT),
    width: percent(1 / scale / widthT),
  };
}

export function frameAspect(extent: MapExtent): number {
  const window = mapWindow(extent);
  const width = (window.east - window.west) / 360;
  const height = window.southT - window.northT;
  return width / height;
}

export function placeOnMap(extent: MapExtent, point: GeoPoint): { left: string; top: string } {
  const window = mapWindow(extent);
  const westT = (window.west + 180) / 360;
  const eastT = (window.east + 180) / 360;
  return {
    left: percent(((point.lon + 180) / 360 - westT) / (eastT - westT)),
    top: percent((mercator(point.lat) - window.northT) / (window.southT - window.northT)),
  };
}

export function streetTilesForFrame(extent: MapExtent): StreetTile[] {
  const window = mapWindow(extent);
  const zoom = chooseZoom(window);
  const scale = 2 ** zoom;
  const westT = (window.west + 180) / 360;
  const eastT = (window.east + 180) / 360;
  const x0 = Math.floor(westT * scale);
  const x1 = Math.floor((eastT - 1e-12) * scale);
  const y0 = Math.floor(window.northT * scale);
  const y1 = Math.floor((window.southT - 1e-12) * scale);
  const tiles: StreetTile[] = [];
  for (let x = x0; x <= x1; x += 1) {
    for (let y = y0; y <= y1; y += 1) {
      tiles.push(tileBox(window, zoom, x, y));
    }
  }
  return tiles;
}

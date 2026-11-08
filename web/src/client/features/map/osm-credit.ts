export const OSM_COPYRIGHT_URL = "https://www.openstreetmap.org/copyright";

export const OSM_MAP_CREDIT = "© OpenStreetMap contributors, HSL, ODbL";

export const OSM_ADDRESS_CREDIT = "Address data © OpenStreetMap contributors, ODbL.";

export function appendOsmCredit(parent: HTMLElement, documentRef: Document, text: string): void {
  const link = documentRef.createElement("a");
  link.href = OSM_COPYRIGHT_URL;
  link.rel = "license noopener";
  link.target = "_blank";
  link.textContent = text;
  parent.append(link);
}

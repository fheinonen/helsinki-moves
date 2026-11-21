export interface TestFileEntry {
  content: string;
  path: string;
}

export interface SnapshotDirEntry {
  files: string[];
  path: string;
}

export interface TestHygieneSnapshot {
  cliBddFiles: TestFileEntry[];
  e2eFiles: TestFileEntry[];
  helperFiles: TestFileEntry[];
  packageScripts: Record<string, string>;
  smokeFiles: TestFileEntry[];
  snapshotDirs: SnapshotDirEntry[];
  unitFiles: TestFileEntry[];
}

export interface TestHygieneViolation {
  code: string;
  file: string;
  message: string;
}

export interface TestHygieneResult {
  violations: TestHygieneViolation[];
}

export function auditTestHygiene(snapshot: TestHygieneSnapshot): TestHygieneResult;

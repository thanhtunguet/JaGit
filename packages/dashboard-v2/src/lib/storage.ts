export interface StorageDriver {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export class LocalStorageDriver implements StorageDriver {
  getItem(key: string): string | null {
    if (typeof localStorage === "undefined") return null;
    return localStorage.getItem(key);
  }

  setItem(key: string, value: string): void {
    if (typeof localStorage === "undefined") return;
    localStorage.setItem(key, value);
  }

  removeItem(key: string): void {
    if (typeof localStorage === "undefined") return;
    localStorage.removeItem(key);
  }
}

// Default storage driver instance
export const storage: StorageDriver = new LocalStorageDriver();

// Copyright (c) 2026 cwcinc. All rights reserved. Unauthorized use prohibited.

// Stores copied block selections (prefabs) in localStorage.
// Each prefab matches the editor clipboard format:
// { parts, tiles, thumbnail } where tiles is an array of [x, y, z] and
// thumbnail is a data URL rendered when the prefab was saved.
class PrefabManager {
  static STORAGE_KEY = "prefabs";

  static load() {
    try {
      const prefabs = JSON.parse(localStorage.getItem(PrefabManager.STORAGE_KEY));
      return Array.isArray(prefabs) ? prefabs : [];
    } catch {
      return [];
    }
  }

  static save(prefab) {
    const prefabs = PrefabManager.load();
    prefabs.push(prefab);
    PrefabManager.saveAll(prefabs);
  }

  static saveAll(prefabs) {
    localStorage.setItem(PrefabManager.STORAGE_KEY, JSON.stringify(prefabs));
  }
}

import { Injectable } from '@angular/core';

@Injectable({
  providedIn: 'root',
})
export class StorageService {
  GetItem<T>(name: string): T | null {
    const itemString = localStorage.getItem(name);
    if (!itemString) {
      return null;
    }

    try {
      return JSON.parse(itemString) as T;
    } catch {
      return null;
    }
  }

  GetItemString(name: string): string | null {
    return localStorage.getItem(name);
  }

  StoreItem<T>(name: string, item: T): void {
    const itemString = JSON.stringify(item);
    localStorage.setItem(name, itemString);
  }

  StoreItemString(name: string, item: string): void {
    localStorage.setItem(name, item);
  }

  RemoveItem(name: string): void {
    localStorage.removeItem(name);
  }

  ClearAll(): void {
    localStorage.clear();
  }
}

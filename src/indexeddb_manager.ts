import { StepData } from './step_manager';

export interface FunctionData {
  stepData: StepData[];
  name: string;
  id?: number;
}

export class IndexedDBManager {
  private dbName: string;
  private storeName: string;

  constructor(dbName: string, storeName: string) {
    this.dbName = dbName;
    this.storeName = storeName;
  }

  public async openDB(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName);

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        db.createObjectStore(this.storeName, { keyPath: 'id', autoIncrement: true });
      };

      request.onsuccess = (event) => {
        resolve((event.target as IDBOpenDBRequest).result);
      };

      request.onerror = (event) => {
        reject(new Error('Error opening IndexedDB'));
      };
    });
  }

  public async saveFunctionData(data: FunctionData): Promise<void> {
    const db = await this.openDB();
    const transaction = db.transaction(this.storeName, 'readwrite');
    const objectStore = transaction.objectStore(this.storeName);
    objectStore.put(data);
  }

  public async updateFunctionDataById(id: number, data: FunctionData): Promise<void> {
    const db = await this.openDB();
    const transaction = db.transaction(this.storeName, 'readwrite');
    const objectStore = transaction.objectStore(this.storeName);
    objectStore.put({ ...data, id });
  }

  public async getAllFunctionData(): Promise<FunctionData[]> {
    return new Promise(async (resolve, reject) => {
      const db = await this.openDB();
      const transaction = db.transaction(this.storeName, 'readonly');
      const objectStore = transaction.objectStore(this.storeName);
      const request = objectStore.getAll();

      request.onsuccess = (event) => {
        resolve((event.target as IDBRequest).result);
      };

      request.onerror = (event) => {
        reject(new Error('Error retrieving data from IndexedDB'));
      };
    });
  }

  public async getFunctionDataById(id: number): Promise<FunctionData> {
    return new Promise(async (resolve, reject) => {
      const db = await this.openDB();
      const transaction = db.transaction(this.storeName, 'readonly');
      const objectStore = transaction.objectStore(this.storeName);
      const request = objectStore.get(id);

      request.onsuccess = (event) => {
        resolve((event.target as IDBRequest).result);
      };

      request.onerror = (event) => {
        reject(new Error('Error retrieving data by ID from IndexedDB'));
      };
    });
  }

  public async deleteFunctionDataById(id: number): Promise<void> {
    const db = await this.openDB();
    const transaction = db.transaction(this.storeName, 'readwrite');
    const objectStore = transaction.objectStore(this.storeName);
    objectStore.delete(id);
  }
}

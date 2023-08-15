import { StepSaveData } from './step';
import Dexie from 'dexie';

export interface FunctionData {
  stepData: StepSaveData[];
  name: string;
  id?: number;
}

class FunctionDatabase extends Dexie {
  functions: Dexie.Table<FunctionData, number>;

  constructor(dbName: string) {
    super(dbName);

    // Define tables and indexes
    this.version(1).stores({
      functions: '++id'
    });

    this.functions = this.table('functions');
  }
}

export class IndexedDBManager {
  private db: FunctionDatabase;

  constructor(dbName: string, storeName: string) {
    this.db = new FunctionDatabase(dbName);
  }

  public async saveFunctionData(data: FunctionData): Promise<number> {
    return this.db.functions.add(data);
  }

  public async updateFunctionDataById(id: number, data: FunctionData): Promise<number> {
    return this.db.functions.put({ ...data, id });
  }

  public async getAllFunctionData(): Promise<FunctionData[]> {
    return this.db.functions.toArray();
  }

  public async getFunctionDataById(id: number): Promise<FunctionData | undefined> {
    return this.db.functions.get(id);
  }

  public async deleteFunctionDataById(id: number): Promise<void> {
    return this.db.functions.delete(id);
  }
}

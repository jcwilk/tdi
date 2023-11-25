// migrations.ts
import { ConversationDB } from './conversationDb';

export function defineConversationDBSchema(db: ConversationDB) {
  db.version(16).stores({
    messages: '&hash,timestamp,parentHash,role,content',
    embeddings: '&hash,timestamp,embedding',
    summaries: '&hash,timestamp,summary',
    summaryEmbeddings: '&hash,timestamp,embedding',
    pins: '&hash,timestamp,version,remoteTimestamp',
    functionResults: '++id,*uuid,timestamp,functionName,result,completed',
    functionDependencies: '&hash,timestamp,dependencyName',
  });

  db.version(17).stores({
    functionDependencies2: '&[hash+dependencyName]',
  })

  db.version(18).upgrade(() => {
    return db.table('functionDependencies').toArray().then(objs => {
      return db.table('functionDependencies2').bulkAdd(objs);
    });
  });

  db.version(19).stores({
    functionDependencies: null
  });

  db.version(20).stores({
    functionDependencies: '&[hash+dependencyName]',
  }).upgrade(() => {
    return db.table('functionDependencies2').toArray().then(objs => {
      return db.table('functionDependencies').bulkAdd(objs);
    });
  });


}

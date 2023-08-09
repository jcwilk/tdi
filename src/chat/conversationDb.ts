// Types and Interfaces
export interface MessageDB {
  content: string;
  participantId: string;
  role: string;
  hash: string;
  timestamp: number;
}

export interface EdgeDB {
  childHash: string;
  parentHash: string;
}

// Simplified IndexedDB wrapper for conversation use-case
export class ConversationDB {
  private dbPromise: Promise<IDBDatabase>;

  constructor() {
    this.dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open("ConversationDatabase", 3);

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;

        if (!db.objectStoreNames.contains("messages")) {
          const messageStore = db.createObjectStore("messages", { keyPath: "hash" });
          messageStore.createIndex("timestamp", "timestamp", { unique: false });
        }

        if (!db.objectStoreNames.contains("edges")) {
          const edgeStore = db.createObjectStore("edges", { keyPath: "compositeHash" });

          // Index for childHash
          edgeStore.createIndex("childHash", "childHash", { unique: false });

          // Index for parentHash
          edgeStore.createIndex("parentHash", "parentHash", { unique: false });
        }


        console.log("Upgrading database...");
      };

      request.onsuccess = (event) => {
        console.log("Database opened successfully.");
        resolve((event.target as IDBOpenDBRequest).result);
      };

      request.onerror = (event) => {
        console.error("Error opening ConversationDatabase", event);
        reject(new Error("Error opening ConversationDatabase"));
      };
    });
  }

  async saveMessage(message: MessageDB, parentHashes: string[]): Promise<void> {
    const db = await this.dbPromise;

    return new Promise((resolve, reject) => {
      const tx = db.transaction(["messages", "edges"], "readwrite");

      tx.onerror = (event) => reject(new Error(`Transaction error: ${event}`));

      tx.objectStore("messages").put(message);

      const edgeStore = tx.objectStore("edges");
      for (const parentHash of parentHashes) {
        edgeStore.put({
          childHash: message.hash,
          parentHash: parentHash,
          compositeHash: `${message.hash}_${parentHash}`
        });
      }

      tx.oncomplete = () => resolve();
    });
  }

  async getMessageByHash(hash: string): Promise<MessageDB | null> {
    const db = await this.dbPromise;

    return new Promise((resolve, reject) => {
      const tx = db.transaction("messages");
      const request = tx.objectStore("messages").get(hash);

      request.onerror = (event) => reject(new Error(`Get message by hash error: ${event}`));
      request.onsuccess = () => {
        resolve(request.result);
      };
    });
  }

  async getConversationFromLeaf(leafHash: string): Promise<MessageDB[]> {
    let currentHash: string | null = leafHash;
    const conversation: MessageDB[] = [];

    while (currentHash) {
      const message = await this.getMessageByHash(currentHash);
      if (message) {
        conversation.push(message);
        const parentEdges = await this.getParentEdgesByChildHash(currentHash);
        currentHash = parentEdges[0]?.parentHash || null;
      } else {
        break;
      }
    }

    return conversation.reverse();
  }

  async getRootMessages(): Promise<MessageDB[]> {
    const db = await this.dbPromise;

    return new Promise((resolve, reject) => {
      const tx = db.transaction("messages");
      const messagesStore = tx.objectStore("messages");
      const timestampIndex = messagesStore.index("timestamp");

      // We'll first fetch all messages, sorted by timestamp.
      const allMessagesRequest = timestampIndex.getAll();

      allMessagesRequest.onerror = (event) => reject(new Error(`Fetch all messages error: ${event}`));

      allMessagesRequest.onsuccess = async () => {
        const allMessages = allMessagesRequest.result as MessageDB[];
        const rootMessages: MessageDB[] = [];

        for (const message of allMessages) {
          const parentEdges = await this.getParentEdgesByChildHash(message.hash);

          // If there are no parent edges, it's a root message.
          if (!parentEdges.length) {
            rootMessages.push(message);
          }
        }

        resolve(rootMessages);
      };
    });
  }

  private async getParentEdgesByChildHash(childHash: string): Promise<EdgeDB[]> {
    const db = await this.dbPromise;

    return new Promise((resolve, reject) => {
      const tx = db.transaction("edges");
      const request = tx.objectStore("edges").index("childHash").getAll(childHash);

      request.onerror = (event) => reject(new Error(`Get parent edges error: ${event}`));
      request.onsuccess = () => {
        resolve(request.result);
      };
    });
  }

  private async getFirstChildByHash(parentHash: string): Promise<MessageDB | null> {
    const db = await this.dbPromise;

    return new Promise((resolve, reject) => {
        const tx = db.transaction(["messages", "edges"]);

        const childHashesReq = tx.objectStore("edges").index("childHash").getAll(parentHash);

        childHashesReq.onsuccess = async () => {
            const edges: EdgeDB[] = childHashesReq.result;

            if (!edges || edges.length === 0) {
                resolve(null);
                return;
            }

            const childMessages: MessageDB[] = [];
            for (const edge of edges) {
                const childMsg = await this.getMessageByHash(edge.childHash);
                if (childMsg) childMessages.push(childMsg);
            }

            // Sort by timestamp and get the first
            childMessages.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
            resolve(childMessages[0]);
        };

        childHashesReq.onerror = (event) => reject(new Error(`Get child edges error: ${event}`));
    });
  }

  public async getConversationFromRoot(rootHash: string): Promise<MessageDB[]> {
    const conversation: MessageDB[] = [];
    let currentMessage = await this.getMessageByHash(rootHash);

    while (currentMessage) {
        conversation.push(currentMessage);
        currentMessage = await this.getFirstChildByHash(currentMessage.hash);
    }

    return conversation;
  }

  public async getLeafMessages(): Promise<MessageDB[]> {
    const db = await this.dbPromise;

    return new Promise((resolve, reject) => {
      const tx = db.transaction(["messages", "edges"]);
      const allMessagesRequest = tx.objectStore("messages").getAll();

      allMessagesRequest.onsuccess = async () => {
        const allMessages: MessageDB[] = allMessagesRequest.result;
        const leafMessages: MessageDB[] = [];

        for (let message of allMessages) {
          const childEdgeRequest = tx.objectStore("edges").index("parentHash").getAll(message.hash);
          await new Promise((innerResolve, innerReject) => {
            childEdgeRequest.onsuccess = () => {
              // if there's no edge where this message is a child, then it's a leaf node.
              if (!childEdgeRequest.result || childEdgeRequest.result.length === 0) {
                leafMessages.push(message);
              }
              innerResolve(null);
            };
            childEdgeRequest.onerror = () => {
              innerReject(new Error(`Failed to check for child edge of message hash: ${message.hash}`));
            };
          });
        }

        resolve(leafMessages);
      };

      allMessagesRequest.onerror = () => {
        reject(new Error("Error retrieving all messages from the database."));
      };
    });
  }

}

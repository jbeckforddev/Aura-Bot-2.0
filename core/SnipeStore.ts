import type { proto } from "baileys";

export const messageCache = new Map<string, proto.IWebMessageInfo>();
export const deletedMessages = new Map<string, proto.IWebMessageInfo[]>();

export const addMessageToCache = (msg: proto.IWebMessageInfo) => {
  const id = msg.key?.id;
  if (!id) return;
  messageCache.set(id, msg);
  
  if (messageCache.size > 500) {
    const firstKey = messageCache.keys().next().value;
    if (firstKey) messageCache.delete(firstKey);
  }
};

export const addDeletedMessage = (jid: string, msg: proto.IWebMessageInfo) => {
  const current = deletedMessages.get(jid) || [];
  current.push(msg);
  if (current.length > 5) current.shift();
  deletedMessages.set(jid, current);
};

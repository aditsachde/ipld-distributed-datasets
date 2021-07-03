import { IPFS, CID } from 'ipfs-core'
import { CID as MultiCID } from 'multiformats/cid'
import fs from 'fs'
import { RocksDBStore, RedisStore, CIDStore } from './hamt.js'
import Redis from 'ioredis'
import { CarWriter } from '@ipld/car'
import { Readable } from 'stream'
import dagCBOR from 'ipld-dag-cbor'
import { HashMapNode, isCid, NodeID, Element } from './hamt.js'

export interface HashMapNodeWithCID {
   [key: number]: Element | CID
}

export class traverseDFS {
   public static async traverse(rootId: NodeID, store: CIDStore, callback: (node: HashMapNode, bytes: Uint8Array, cid: CID) => void): Promise<CID> {
      return await this.traverseHelper(rootId, store, callback)
   }

   private static async traverseHelper(id: NodeID, store: CIDStore, callback: (node: HashMapNode, bytes: Uint8Array, cid: CID) => void): Promise<CID> {
      let node = await store.get(id) // as HashMapNodeWithCID
      // as HashMapNodeWithCID results in TS complaining on item on line 26

      for (const key in node) {
         let item = node[key]
         if (!Array.isArray(item)) {
            node[key] = await this.traverseHelper(item, store, callback) as unknown as number // THIS IS WRONG AND BAD AND JANK AND UNSAFE
         } else {
            for (let i = 0; i < item.length; i++) {
               item[i].key = Buffer.from(item[i].key, 'hex') as unknown as string // THIS IS WRONG AND BAD AND JANK AND UNSAFE
               item[i].value = new CID(item[i].value)
            }
         }
      }

      let bytes = dagCBOR.util.serialize(node)
      let cid = await dagCBOR.util.cid(bytes)
      // must use await as callback may be async
      await callback(node, bytes, cid)
      return cid
   }
}

console.time("buildindexcar")

let store = new RocksDBStore('./rocksdb')
//let store = new RedisStore(new Redis())

let emptyBlock = dagCBOR.util.serialize({})
let emptyCID = await dagCBOR.util.cid(emptyBlock)

console.info(emptyCID)

// Instead of using an empty block, the root of the tree can be used to automatically pin the tree on import.
let rootCID = new CID("bafyreicbrkooyak2baydxsqpguatlp4ysokcthgp2vflfjzl33342vd2cm")

const { writer, out } = await CarWriter.create([emptyCID as unknown as MultiCID])
Readable.from(out).pipe(fs.createWriteStream('index.car'))
writer.put({ cid: emptyCID as unknown as MultiCID, bytes: emptyBlock })

let rootcid = await traverseDFS.traverse(1, store, async (node, bytes, cid) => {
   await writer.put({ cid: (cid as unknown as MultiCID), bytes })
})

console.log("Root cid: " + rootcid)

await writer.close()

console.timeEnd("buildindexcar")

//store.close()
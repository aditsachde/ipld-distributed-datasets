/**
 * This module implements a HAMT data structure spread over many IPFS blocks.
 * Its not a very good implementation but it works
 * 
 * When rewriting, the HAMTAny & HAMTStringCID interfaces should be kept the same.
 * Initializing can be changed if there is a better way to do it and everything can be renamed.
 * 
 * The tests make sure that the data format hasn't changed by checking against known CIDs.
 * It can be changed if there is a good reason but would require regenerating entire trees.
 */

import { CID } from 'ipfs-core'
import crypto from 'crypto'
import dagCBOR from 'ipld-dag-cbor'
import levelup, { LevelUp } from 'levelup'
import rocksdb from 'rocksdb'
import { Redis } from 'ioredis'

export type NodeID = number

export interface HashMapNode {
    [key: number]: Element
}

export type Element = Bucket[] | NodeID

interface Bucket {
    key: string,
    value: any
}

interface IdNode {
    id: NodeID,
    node: HashMapNode
}

const BITWIDTH = 8;
const BUCKET_SIZE = 4;

export interface HAMTAny {
    // Is there a better way to do init?
    // init(client: IPFS, root?: CID): void
    get(key: any): Promise<any | void>
    set(key: any, value: any): Promise<void>
    //delete(key: any): Promise<void>
}

export interface HAMTStringCID {
    // Is there a better way to do init?
    // init(client: IPFS, root?: CID): void
    get(key: string): Promise<CID | void>
    set(key: string, value: CID): Promise<void>
    //delete(key: string): Promise<void>
}

export class HAMT implements HAMTAny, HAMTStringCID {
    public root: HashMapNode = {}
    private store!: CIDStore
    public rootid!: NodeID

    private constructor() { }

    public static async init(store: CIDStore, rootId?: NodeID) {
        let hamt = new HAMT()
        await hamt._init(store, rootId)
        return hamt
    }

    private async _init(store: CIDStore, rootId?: NodeID) {
        // Await can't be used in constructor
        this.store = store
        this.rootid = store.nextId()
        this.root = {}
        await this.putNode(this.root, this.rootid)
    }

    // public async serialize(callback: (cid: CID, bytes: Uint8Array) => void): Promise<CID> {
    //     if (this.consumed) {
    //         throw new Error("HAMT consumed!")
    //     }

    //     this.consumed = true
    //     return this.serializeHelper(this.root, callback)
    // }

    // private async serializeHelper(node: HashMapNode, callback: (cid: CID, bytes: Uint8Array) => void): Promise<CID> {
    //     for (const key in node) {
    //         const value = node[key]
    //         if (!Array.isArray(value)) {
    //             node[key] = await this.serializeHelper(value, callback)
    //         }
    //     }
    //     const bytes = dagCBOR.util.serialize(node)
    //     const cid = await dagCBOR.util.cid(bytes)
    //     // callback may be async
    //     await callback(cid, bytes)
    //     return cid
    // } 

    private async getNode(nodeId: NodeID): Promise<HashMapNode> {
        return await this.store.get(nodeId)
    }

    private async putNode(node: HashMapNode, nodeId: NodeID): Promise<NodeID> {
        await this.store.put(nodeId, node)
        return nodeId
    }

    public async get(key: any): Promise<any | void> {
        let hash: Uint8Array = crypto.createHash('sha256').update(key).digest()
        return await this.getHelper(0, this.root, hash)

    }

    private async getHelper(depth: number, node: HashMapNode, hash: Uint8Array): Promise<any | void> {
        if (depth > 31) {
            throw new Error("Depth limit exceded")
        }
        const index = hash[depth]
        if (index in node) {
            const current = node[index]
            if (isBucket(current)) {
                for (let i = 0; i < current.length; i++) {
                    let element = current[i]
                    if (element.key.toString() === hash.toString()) {
                        return element.value
                    }
                }
                return
            } else {
                let childNode = await this.getNode(current)
                return await this.getHelper(depth + 1, childNode, hash)
            }
        } else {
            return
        }
    }

    public async set(key: any, value: any): Promise<void> {
        let hash: Uint8Array = crypto.createHash('sha256').update(key).digest()
        let { id, node } = await this.setHelper(value, 0, this.root, hash, this.rootid)
        this.root = node
        this.rootid = id
    }

    private async setHelper(value: any, depth: number, node: HashMapNode, hash: Uint8Array, id: NodeID): Promise<IdNode> {
        if (depth > 31) {
            throw new Error("Depth limit exceded")
        }
        const hashstring = Buffer.from(hash).toString('hex')
        const index = hash[depth]
        if (index in node) {
            const current = node[index]
            if (isBucket(current)) {
                let bucketIndex = findWithKey(current, hashstring)
                if (bucketIndex !== -1) {
                    current[bucketIndex] = { key: hashstring, value }
                } else if (current.length < BUCKET_SIZE) {
                    current.push({ key: hashstring, value })
                    current.sort(compare)
                } else {
                    let childNode = this.newNode()
                    const childNodeId = this.store.nextId()
                    for (let i = 0; i < current.length; ++i) {
                        const element = current[i]
                        let { node: newChildNode } = await this.setHelper(element.value, depth + 1, childNode, Buffer.from(element.key, 'hex'), childNodeId)
                        childNode = newChildNode
                    }
                    let { id: newChildNodeId } = await this.setHelper(value, depth + 1, childNode, hash, childNodeId)
                    node[index] = newChildNodeId

                }
            } else {
                let childNodeId = current
                let childNode = await this.getNode(childNodeId)
                let { id: newChildNodeId } = await this.setHelper(value, depth + 1, childNode, hash, childNodeId)
                node[index] = newChildNodeId
            }
        } else {
            let newBucket: Bucket[] = [{ key: hashstring, value}]
            node[index] = newBucket
        }

        await this.putNode(node, id)
        return { id, node }
    }

    private newNode(): HashMapNode {
        return {}
    }

}

export interface CIDStore {
    get(nodeId: NodeID): Promise<HashMapNode>
    put(nodeId: NodeID, data: HashMapNode): Promise<void>
    nextId(): NodeID
}

export class RocksDBStore implements CIDStore {

    private db: LevelUp
    private dbname: string
    private nodecount = 0

    constructor(dir: string) {
        this.dbname = dir
        this.db = levelup(rocksdb(dir), { writeBufferSize: 33554432, maxFileSize: 16777216 })
    }

    async get(nodeId: NodeID): Promise<HashMapNode> {
        let result = (await this.db.get(nodeId.toString()))
        return JSON.parse(result)
    }

    async put(nodeId: NodeID, data: HashMapNode): Promise<void> {
        let json = JSON.stringify(data)
        await this.db.put(nodeId.toString(), json)
    }

    nextId(): NodeID {
        this.nodecount = this.nodecount + 1
        return this.nodecount
    }
}


export class RedisStore implements CIDStore {

    private db: Redis
    private nodecount = 0

    constructor(redis: Redis) {
        this.db = redis
    }

    async get(nodeId: NodeID): Promise<HashMapNode> {
        let result = await this.db.get(nodeId.toString())
        if (result === null) {
            throw new Error("Node not found " + nodeId)
        }
        return JSON.parse(result)
    }

    async put(nodeId: NodeID, data: HashMapNode): Promise<void> {
        let json = JSON.stringify(data)
        await this.db.set(nodeId.toString(), json)
    }

    nextId(): NodeID {
        this.nodecount = this.nodecount + 1
        return this.nodecount
    }

    async close() {
        await this.db.quit()
    }
}

function isBucket(obj: Element): obj is Bucket[] {
    return Array.isArray(obj)
}

export function isCid(obj: any): obj is CID {
    return CID.isCID(obj)
}

function compare(a: Bucket, b: Bucket) {
    if (a.key < b.key)
        return -1;
    if (a.key > b.key)
        return 1;
    return 0;
}

function findWithKey(array: Bucket[], hashstring: string) {
    for (var i = 0; i < array.length; i += 1) {
        if (array[i]['key'] === hashstring) {
            return i;
        }
    }
    return -1;
}
import rocksdb from 'rocksdb'
import levelup, { LevelUp } from 'levelup'
import { CID, IPFS } from 'ipfs-core'
import { HashMapNode } from './hamt.js'
import dagCBOR from 'ipld-dag-cbor'

export interface CIDStore {
    get(cid: CID): Promise<HashMapNode>
    put(cid: CID, data: HashMapNode): Promise<void>
}

export class RocksDBStore implements CIDStore {

    private db: LevelUp
    private dbname: string

    constructor(dir: string) {
        this.dbname = dir
        this.db = levelup(rocksdb(dir), { writeBufferSize: 33554432, maxFileSize: 16777216 })
    }

    async get(cid: CID): Promise<HashMapNode> {
        console.log("getting cid " + cid)
        return (await this.db.get(cid.toString()))
    }

    async put(cid: CID, data: HashMapNode): Promise<void> {
        console.log("setting cid " + cid)
        await this.db.put(cid.toString(), data)
    }
}

export class IPFSStore implements CIDStore {

    private ipfs: IPFS

    constructor(ipfs: IPFS) {
        this.ipfs = ipfs
    }

    async get(cid: CID): Promise<HashMapNode> {
        const bytes = (await this.ipfs.block.get(cid)).data
        return dagCBOR.util.deserialize(bytes) as HashMapNode
    }

    async put(cid: CID, data: HashMapNode): Promise<void> {
        const bytes = dagCBOR.util.serialize(data)
        await this.ipfs.block.put(bytes)
    }
}

export class MemoryStore implements CIDStore {

    private map: Map<CID, HashMapNode>

    constructor() {
        this.map = new Map()
    }

    async get(cid: CID): Promise<HashMapNode> {
        let result = this.map.get(cid)
        if (result === undefined) {
            throw new Error("key not found! " + cid.toString())
        }
        return result
    }

    async put(cid: CID, data: HashMapNode): Promise<void> {
        this.map.set(cid, data)
    }
}
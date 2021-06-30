/**
 * This module implements a HAMT data structure spread over many IPFS blocks.
 * Its not a very good implementation but it works
 * 
 * It is also not IPLD ADT HAMT compatible
 * 
 * TODO: Write tests
 */

import { CID } from 'ipfs-core'
import crypto from 'crypto'
import { CIDStore } from './store'

export interface HashMapNode {
    [key: number]: Element
}

type Element = Bucket[] | CID

interface Bucket {
    key: Uint8Array,
    value: any
}

interface CidNode {
    cid: CID,
    node: HashMapNode
}

const BITWIDTH = 8;
const BUCKET_SIZE = 4;

export interface HAMTAny {
    // init(store: CIDStore, root: CID): void
    cid: CID,
    get(key: any): Promise<any | void>
}

export interface HAMTStringCID {
    // init(store: CIDStore, root: CID): void
    cid: CID,
    get(key: string): Promise<CID | void>
}

export class HAMT implements HAMTAny, HAMTStringCID {
    // Is always set during init, but can't be checked by typescript
    private store!: CIDStore;
    private root!: HashMapNode;
    public cid!: CID;

    private constructor() { }

    public static async init(store: CIDStore, root: CID) {
        let hamt = new HAMT()
        await hamt._init(store, root)
        return hamt
    }

    private async _init(store: CIDStore, root: CID) {
        // Await can't be used in constructor
        this.store = store
        this.root = await this.getNode(root)
        this.cid = root
    }

    async get(key: any): Promise<any | void> {
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

    private async getNode(cid: CID): Promise<HashMapNode> {
        return await this.store.get(cid)
    }
}

function isBucket(obj: Element): obj is Bucket[] {
    return Array.isArray(obj)
}

export function isCid(obj: Element): obj is CID {
    return CID.isCID(obj)
}
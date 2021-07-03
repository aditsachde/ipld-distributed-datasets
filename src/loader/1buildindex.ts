import { IPFS, CID } from 'ipfs-core'
import { CID as MultiCID } from 'multiformats/cid'
import { create as IPFSClient } from 'ipfs-http-client'
import fs from 'fs'
import { HAMT, HAMTAny, HAMTStringCID, HashMapNode, RocksDBStore, RedisStore } from './hamt.js'
import dagCBOR from 'ipld-dag-cbor'
import readline from 'readline'
import { CarWriter, CarReader } from '@ipld/car'
import { Readable } from 'stream'
import { Block } from '@ipld/car/api'
import Redis from 'ioredis'

// The ipfsstore has been tested to make sure that the same CIDs are
// generated, but no further.
// const ipfs = IPFSClient()
// let ipfsstore: CIDStore = new IPFSDBStore(ipfs as unknown as IPFS)


let emptyBlock = dagCBOR.util.serialize({})
let emptyCID = await dagCBOR.util.cid(emptyBlock)
let emptyCIDstring = emptyCID.toString()
let store = new RocksDBStore('./rocksdb')
//let store = new RedisStore(new Redis())

console.time("add")

let hamt = await HAMT.init(store)

const filestream = fs.createReadStream("authors.txt")
const rl = readline.createInterface({
   input: filestream,
   crlfDelay: Infinity
})

let counter1 = 0
let counter2 = 0
for await (const line of rl) {
   let pieces = line.split('\t')
   let key = pieces[1]
   let json = JSON.parse(pieces[4])
   let cid = await dagCBOR.util.cid(dagCBOR.util.serialize(json))
   await hamt.set(key, cid.toString())   
   
   counter2 = counter2 + 1
   if (counter2 === 10000) {
      counter1 = counter1 + 1
      counter2 = 0
      console.log(cid.toString())
      console.log('\x1b[36m%s\x1b[0m', counter1)
      console.timeLog("add")
   }
}
console.log("hamt root id: " + hamt.rootid)

console.timeEnd("add")

//await store.close()

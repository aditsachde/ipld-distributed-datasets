import { create } from 'ipfs-http-client'
import { IPFS, CID } from 'ipfs-core'
import { HAMT, HAMTStringCID } from './hamt.js'
import { IPFSStore } from './store.js'

let root = new CID("bafyreicbrkooyak2baydxsqpguatlp4ysokcthgp2vflfjzl33342vd2cm")

let ipfs = create() as unknown as IPFS
let ipfsstore = new IPFSStore(ipfs)
let hamt: HAMTStringCID = await HAMT.init(ipfsstore, root)

let searchstring = process.argv[2]
if (searchstring === undefined) {
    throw new Error("Must provide key to find as argument")
}
console.log(searchstring)

let cid = await hamt.get(searchstring)
if (cid === undefined) {
    throw new Error("Key not found!")
}
console.log(cid)

let result = await ipfs.dag.get(cid)
console.log(result.value)
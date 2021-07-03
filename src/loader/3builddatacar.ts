import { CarWriter, CarReader } from '@ipld/car'
import fs from 'fs'
import { Readable } from 'stream'
import { Block } from '@ipld/car/api'
import { CID as MultiCID } from 'multiformats/cid'
import dagCBOR from 'ipld-dag-cbor'
import readline from 'readline'

console.time("builddatacar")

let emptyBlock = dagCBOR.util.serialize({})
let emptyCID = await dagCBOR.util.cid(emptyBlock)

const { writer, out } = CarWriter.create([emptyCID as unknown as MultiCID])
Readable.from(out).pipe(fs.createWriteStream('data.car'))
writer.put({ cid: emptyCID as unknown as MultiCID, bytes: emptyBlock })

const filestream = fs.createReadStream("authors_short.txt")
const rl = readline.createInterface({
   input: filestream,
   crlfDelay: Infinity
})

for await (const line of rl) {
   let pieces = line.split('\t')
   let key = pieces[1]
   let json = JSON.parse(pieces[4])
   let block = dagCBOR.util.serialize(json)
   let cid = await dagCBOR.util.cid(block)
   await writer.put({ cid: cid as unknown as MultiCID, bytes: block })
}

await writer.close()

console.timeEnd("builddatacar")

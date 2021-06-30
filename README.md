# ipld-distrubuted-datasets

This is a demo of storing a large dataset (100k entries) as IPLD tree.

First, download the dataset and `.car` files from the releases page. The `data100k.car` file contains all the blocks that comprise the leaves of the tree. It should be imported first with `ipfs dag import data100k.car`. The `index100k.car` file contains all the blocks that form the HAMT datastructure which allows for lookups based on the key. It can be imported with `ipfs dag import index100k.car`.

**Make sure to use the Badger datastore!** This tree has over 100k blocks and will take forever to import using the default flatfs datastore. It can be initialized with `ipfs init --profile=badgerds`.

Next, clone this repository and install the dependencies using `yarn install`. Finally, make sure the IPFS daemon is running locally. You're now ready to make some queries.

```bash
yarn start "/authors/OL1000002A"                  

yarn run v1.22.10
$ node lib/index.js /authors/OL1000002A
/authors/OL1000002A
CID(bafyreia6hkprpebdnnooawfgap3rvq6ues6ey6s5gbrs4nbeuhvftrrhbq)
{
  key: '/authors/OL1000002A',
  name: 'Īfilīn Farīd Jūrj Yārid',
  type: { key: '/type/author' },
  revision: 2,
  last_modified: { type: '/type/datetime', value: '2008-08-20T17:57:01.109549' },
  personal_name: 'Īfilīn Farīd Jūrj Yārid'
}
✨  Done in 0.63s.
```

## More Information

The CID of the root is `bafyreicbrkooyak2baydxsqpguatlp4ysokcthgp2vflfjzl33342vd2cm`. It is serialized using `dag-cbor`.

The entire dataset is on IPFS, but is pretty slow as it is only present on a single node, so its recommended to load it into your local node. The [IPLD explorer](https://explore.ipld.io/) is a great way to visualize how the data is structured.

The records were loaded from `authors100k.txt`. The second column in the file is the key.
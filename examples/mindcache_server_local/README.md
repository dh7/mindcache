# MindCache Server Local Example

This example creates sample MindCache files, starts the local `mindcache-server` API, and starts a browser client that:

- lists all tags
- lets you select tags
- shows keys that match selected tags (`all` or `any` mode)

## Run

```bash
cd examples/mindcache_server_local
npm install
npm run dev
```

Then open:

- Client UI: [http://127.0.0.1:4173](http://127.0.0.1:4173)
- API: [http://127.0.0.1:4040](http://127.0.0.1:4040)

## Separate commands

```bash
# create sample files in ./data
npm run seed

# start only API server
npm run server

# start only client UI server
npm run client
```

## What gets created

Sample files are created under:

- `examples/mindcache_server_local/data/team-a/memory.md`
- `examples/mindcache_server_local/data/team-b/memory.md`

The API loads these files and indexes keys as:

- `team-a/memory.md::customer_profile`
- `team-b/memory.md::customer_profile`

This demonstrates collision-safe keys based on relative file path.

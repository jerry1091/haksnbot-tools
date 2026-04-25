# scripts/

Helper scripts for maintaining MC 26.1.2 compatibility patches.

## Extracting server report data (needed for gen_blocks.py / gen_items.py)

Run once per MC version upgrade. Requires access to the MineOS server container on Flash (192.168.1.152).

### 1. Generate the report from the server jar

```bash
ssh root@192.168.1.152 \
  "docker exec MineOS_NG /usr/lib/jvm/temurin-25-jre-amd64/bin/java \
   -DbundlerMainClass=net.minecraft.data.Main \
   -jar /var/games/minecraft/servers/The_Future_Family/minecraft_server.26.1.2.jar \
   --reports --output /tmp/mc-reports"
```

### 2. Copy report files to host /tmp

```bash
ssh root@192.168.1.152 "docker cp MineOS_NG:/tmp/mc-reports/generated/. /tmp/mc-reports-host/"

# blocks report (used by gen_blocks.py)
scp root@192.168.1.152:/tmp/mc-reports-host/reports/blocks.json /tmp/blocks_26.1.2_report.json

# registries (used by gen_items.py)
scp root@192.168.1.152:/tmp/mc-reports-host/reports/registries.json /tmp/registries_26.1.2.json
```

### 3. Run the generators

From the haksnbot-tools directory:

```bash
python3 scripts/gen_blocks.py
python3 scripts/gen_items.py
```

This writes `blocks.json` and `items.json` into `node_modules/minecraft-data/minecraft-data/data/pc/26.1.2/`.

#!/bin/bash

set -e

TIMESTAMP=$(date +"%Y-%m-%d_%H-%M-%S")
BACKUP_FILE="backups/andon-production-${TIMESTAMP}.db"

mkdir -p backups

echo "Creating production database backup..."

railway ssh "node -e \"const Database=require('better-sqlite3'); const db=new Database('/data/andon.db'); db.backup('/data/andon-backup.db').then(()=>{console.log('Production backup created successfully'); db.close();}).catch(e=>{console.error(e); process.exit(1)})\""

echo ""
echo "Downloading backup..."

scp railway-gg-andon:/data/andon-backup.db "$BACKUP_FILE"

echo ""
echo "======================================"
echo "BACKUP COMPLETE"
echo "======================================"
echo "Saved to: $BACKUP_FILE"
ls -lh "$BACKUP_FILE"

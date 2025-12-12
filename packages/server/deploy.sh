#!/bin/bash

# MindCache Production Deployment Script
# Applies database migrations and deploys the worker

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

print_header() {
    echo ""
    echo -e "${BLUE}╔════════════════════════════════════════╗${NC}"
    echo -e "${BLUE}║${NC}     ${GREEN}MindCache Production Deploy${NC}        ${BLUE}║${NC}"
    echo -e "${BLUE}╚════════════════════════════════════════╝${NC}"
    echo ""
}

check_pending_migrations() {
    echo -e "${BLUE}Checking pending migrations...${NC}"
    cd "$SCRIPT_DIR"
    
    local pending=$(pnpm db:migrations:list 2>&1 | grep -E "Migrations to be applied|No migrations to apply" || true)
    
    if echo "$pending" | grep -q "No migrations to apply"; then
        echo -e "  ${GREEN}✓${NC} No pending migrations"
        return 0
    elif echo "$pending" | grep -q "Migrations to be applied"; then
        echo -e "  ${YELLOW}⚠${NC} Pending migrations found:"
        pnpm db:migrations:list 2>&1 | grep -A 20 "Migrations to be applied" | sed 's/^/    /'
        return 1
    else
        echo -e "  ${YELLOW}○${NC} Could not determine migration status"
        return 1
    fi
}

apply_migrations() {
    echo ""
    echo -e "${BLUE}Applying database migrations...${NC}"
    cd "$SCRIPT_DIR"
    
    if pnpm db:migrate; then
        echo -e "  ${GREEN}✓${NC} Migrations applied successfully"
        return 0
    else
        echo -e "  ${RED}✗${NC} Migration failed!"
        return 1
    fi
}

deploy_worker() {
    echo ""
    echo -e "${BLUE}Deploying worker to production...${NC}"
    cd "$SCRIPT_DIR"
    
    if pnpm run deploy; then
        echo -e "  ${GREEN}✓${NC} Worker deployed successfully"
        return 0
    else
        echo -e "  ${RED}✗${NC} Deployment failed!"
        return 1
    fi
}

print_header

# Check for pending migrations
if ! check_pending_migrations; then
    echo ""
    echo -e "${YELLOW}⚠  WARNING: There are pending migrations${NC}"
    echo ""
    read -p "Apply migrations before deploying? (y/N): " -n 1 -r
    echo ""
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo -e "${YELLOW}Skipping migrations. Deploying worker only...${NC}"
    else
        if ! apply_migrations; then
            echo ""
            echo -e "${RED}Migration failed. Aborting deployment.${NC}"
            exit 1
        fi
    fi
fi

# Deploy worker
if ! deploy_worker; then
    echo ""
    echo -e "${RED}Deployment failed!${NC}"
    exit 1
fi

echo ""
echo -e "${GREEN}════════════════════════════════════════${NC}"
echo -e "  ${GREEN}✓ Deployment complete!${NC}"
echo ""
echo -e "  Production: ${BLUE}https://mindcache-api.YOUR_SUBDOMAIN.workers.dev${NC}"
echo -e "${GREEN}════════════════════════════════════════${NC}"
echo ""

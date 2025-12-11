#!/bin/bash

# MindCache Development Script
# Starts both server and frontend with environment validation

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

SERVER_PID=""
WEB_PID=""

cleanup() {
    echo ""
    echo -e "${YELLOW}⏹  Shutting down...${NC}"
    
    if [ -n "$SERVER_PID" ] && kill -0 "$SERVER_PID" 2>/dev/null; then
        kill "$SERVER_PID" 2>/dev/null
        echo -e "${GREEN}✓${NC} Server stopped"
    fi
    
    if [ -n "$WEB_PID" ] && kill -0 "$WEB_PID" 2>/dev/null; then
        kill "$WEB_PID" 2>/dev/null
        echo -e "${GREEN}✓${NC} Frontend stopped"
    fi
    
    exit 0
}

trap cleanup SIGINT SIGTERM

print_header() {
    echo ""
    echo -e "${BLUE}╔════════════════════════════════════════╗${NC}"
    echo -e "${BLUE}║${NC}       ${GREEN}MindCache Development${NC}            ${BLUE}║${NC}"
    echo -e "${BLUE}╚════════════════════════════════════════╝${NC}"
    echo ""
}

check_env_var() {
    local file=$1
    local var=$2
    local required=$3
    
    if grep -q "^${var}=" "$file" 2>/dev/null; then
        local value=$(grep "^${var}=" "$file" | cut -d'=' -f2)
        if [ -n "$value" ] && [ "$value" != "your_"* ]; then
            echo -e "  ${GREEN}✓${NC} $var"
            return 0
        fi
    fi
    
    if [ "$required" = "required" ]; then
        echo -e "  ${RED}✗${NC} $var ${RED}(missing or placeholder)${NC}"
        return 1
    else
        echo -e "  ${YELLOW}○${NC} $var ${YELLOW}(optional, not set)${NC}"
        return 0
    fi
}

check_server_env() {
    echo -e "${BLUE}Checking server environment...${NC}"
    local server_env="$SCRIPT_DIR/server/.dev.vars"
    local errors=0
    
    if [ ! -f "$server_env" ]; then
        echo -e "  ${RED}✗${NC} .dev.vars file not found"
        echo ""
        echo -e "  Create ${YELLOW}packages/server/.dev.vars${NC} with:"
        echo -e "  ${YELLOW}OPENAI_API_KEY=sk-...${NC}"
        echo ""
        return 1
    fi
    
    check_env_var "$server_env" "OPENAI_API_KEY" "required" || ((errors++))
    check_env_var "$server_env" "FIREWORKS_API_KEY" "optional"
    check_env_var "$server_env" "GEMINI_API_KEY" "optional"
    
    return $errors
}

check_web_env() {
    echo ""
    echo -e "${BLUE}Checking frontend environment...${NC}"
    local web_env="$SCRIPT_DIR/web/.env.local"
    local errors=0
    
    if [ ! -f "$web_env" ]; then
        echo -e "  ${YELLOW}○${NC} .env.local not found (will use defaults)"
        echo ""
        echo -e "  ${YELLOW}Tip:${NC} Create ${YELLOW}packages/web/.env.local${NC} for Clerk auth:"
        echo -e "  ${YELLOW}NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_...${NC}"
        echo -e "  ${YELLOW}CLERK_SECRET_KEY=sk_...${NC}"
        echo ""
        return 0
    fi
    
    check_env_var "$web_env" "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY" "optional"
    check_env_var "$web_env" "CLERK_SECRET_KEY" "optional"
    check_env_var "$web_env" "NEXT_PUBLIC_API_URL" "optional"
    
    return $errors
}

apply_migrations() {
    echo ""
    echo -e "${BLUE}Applying database migrations...${NC}"
    cd "$SCRIPT_DIR/server"
    
    # Apply migrations (idempotent - safe to run multiple times)
    # Suppress output unless there's an error
    if pnpm db:migrate:local > /dev/null 2>&1; then
        echo -e "  ${GREEN}✓${NC} Database migrations applied"
    else
        # If it fails, show what happened (might just be "already applied")
        echo -e "  ${YELLOW}○${NC} Checking migration status..."
        pnpm db:migrate:local 2>&1 | head -5 || true
    fi
}

start_server() {
    echo ""
    echo -e "${BLUE}Starting server...${NC}"
    cd "$SCRIPT_DIR/server"
    pnpm dev &
    SERVER_PID=$!
    echo -e "  ${GREEN}✓${NC} Server starting on ${GREEN}http://localhost:8787${NC} (PID: $SERVER_PID)"
}

start_web() {
    echo ""
    echo -e "${BLUE}Starting frontend...${NC}"
    cd "$SCRIPT_DIR/web"
    pnpm dev &
    WEB_PID=$!
    echo -e "  ${GREEN}✓${NC} Frontend starting on ${GREEN}http://localhost:3000${NC} (PID: $WEB_PID)"
}

print_header

# Check environments
server_ok=true
web_ok=true

check_server_env || server_ok=false
check_web_env || web_ok=false

if [ "$server_ok" = false ]; then
    echo ""
    echo -e "${RED}Server environment check failed. Please fix the issues above.${NC}"
    exit 1
fi

# Apply database migrations before starting server
apply_migrations

# Start services
start_server
sleep 2  # Give server time to start
start_web

echo ""
echo -e "${GREEN}════════════════════════════════════════${NC}"
echo -e "  ${GREEN}Both services are starting!${NC}"
echo ""
echo -e "  Server:   ${BLUE}http://localhost:8787${NC}"
echo -e "  Frontend: ${BLUE}http://localhost:3000${NC}"
echo ""
echo -e "  Press ${YELLOW}Ctrl+C${NC} to stop both services"
echo -e "${GREEN}════════════════════════════════════════${NC}"
echo ""

# Wait for both processes
wait


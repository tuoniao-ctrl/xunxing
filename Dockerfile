FROM node:20-alpine

# Render 部署需要编译工具（better-sqlite3 需要）
RUN apk add --no-cache python3 make g++

WORKDIR /app

# 安装依赖
COPY package*.json ./
RUN npm ci --production

# 复制源码
COPY . .

# 创建数据目录（Render 持久化磁盘挂载点）
RUN mkdir -p /app/database

EXPOSE 3000

# 健康检查
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:${PORT:-3000}/api/health || exit 1

# 启动
CMD ["node", "server.js"]

# 使用官方的Deno镜像作为基础
FROM denoland/deno:latest

# 将工作目录设置在/app
WORKDIR /app

# 将项目文件复制到工作目录中
# 注意：如果你的Deno项目有依赖文件（如deps.ts或deno.json），最好先复制并缓存它们
# 为了简单起见，我们先复制所有文件
COPY . .

# 运行deno cache来下载依赖（可选，但推荐）
RUN deno cache main.ts

# 暴露应用将监听的端口
EXPOSE 8080

# 容器启动时运行的命令
CMD ["deno", "run", "--allow-net", "--allow-read", "--allow-env", "main.ts"]

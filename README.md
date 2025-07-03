# 实时数据可视化面板

本项目是一个轻量级、高性能的实时数据可视化工具。它使用基于 Deno 的后端来驱动一个简单的前端应用，该应用通过 WebSocket 连接以显示实时数据流。

## 功能特性

-   **实时图表**: 使用简洁的图表实时展示数据更新。
-   **WebSocket 后端**: 高效的 Deno 服务器，用于向客户端推送数据。
-   **轻量级**: 最小化的依赖和极小的资源占用。
-   **可扩展**: 为处理大量并发连接而设计。

## 如何开始

### 环境要求

-   已安装 [Deno](https://deno.land/) 运行时。

### 运行应用

1.  进入 `server` 目录:
    ```bash
    cd server
    ```

2.  启动服务器:
    ```bash
    deno run --allow-net --allow-read main.js
    ```

3.  打开浏览器并访问 `http://localhost:8080`。

## 系统架构

-   **前端**: 位于 `public` 目录。包含 `index.html`、`style.css` 以及用于处理 WebSocket 通信和渲染图表的客户端脚本 `chart.js`。
-   **后端**: 位于 `server` 目录。
    -   `main.js`: Deno 服务器的主入口文件。
    -   `request_handler.js`: 处理传入的 HTTP 请求并进行路由。
    -   `stream_handler.js`: 管理用于实时数据流的 WebSocket 连接。
    -   `decoy_data_generator.js`: 为数据可视化生成随机的诱骗数据。
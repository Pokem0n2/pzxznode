# pzxznode
《屁者先知》桌游手机版自建服务器，node.js + express + socket.io

由于本人很少在线，欢迎广大爱心人士自己fork后创建分支，自行优化代码和布局样式。
个人奉行能跑就行的原则，没有花精力优化，所以代码和样式一团糟，请大家见谅。

项目用到了[nosleep.js](https://github.com/richtr/NoSleep.js)，但是测试效果不佳，建议直接在微信中打开网页，哪怕切换为浮窗也不容易掉线。

项目在安卓手机上布局更协调，在小屏iPhone上表现不佳，例如5S、SE以及更早的苹果系手机

# 食用方法
## 1. 安卓手机当服务器
安装[termux](https://github.com/termux/termux-app)（我用的0.118.3版本），将项目拷贝到某个目录，然后cd到该目录后，执行：
```bash
node server.js
```
如果是自建热点，则访问http://localhost:3080 ；
如果是局域网中，则访问http://你的IP:3080 。
注意：如果省略了开头的http:// 可能会跳转https:// 但是因为没有证书，所以会访问错误。
由于termux在安卓设备上运行npm install有问题，所以建议将node_modules也拷贝到手机上，如果模块需要删改，建议先在电脑上操作后，再将package.json和node_modules拷贝

## 2. 电脑端当局域网服务器
电脑上下载[.msi](https://nodejs.org/dist/v22.17.0/node-v22.17.0-x64.msi)安装好node.js（node 18+运行没问题，理论上低版本也没问题），或者电脑上安装[Docker Desktop](https://www.docker.com/products/docker-desktop/)，然后使用[官方命令](https://nodejs.org/en/download)拉取镜像，并运行容器于端口3080，其他局域网内设备通过http://localhost:3080 或者http://你的服务器IP:3080 来访问网页

## 3. Linux或者自己的网站服务器
通过node命令直接运行服务，或者先安装Docker，然后在node.js容器中运行

# 可选安装
由于每次修改要重新启动服务才能测试出效果，可以考虑是否安装[nodemon](https://github.com/remy/nodemon)，个人不推荐。

```bash
npm install -g nodemon # or using yarn: yarn global add nodemon
```

使用时只需将原来node server.js替换成nodemon server.js
或者自行在package.json中配置，可参考nodemon -h中的参数使用说明。

```bash
nodemon -h
```

例如，汝可将package.json修改为：

```json
{
  "name": "fart-web",
  "version": "1.0.0",
  "main": "server.js",
  "scripts": {
    "test": "echo \"Error: no test specified\" && exit 1",
    "start": "nodemon -w public -w server.js -e js,html,css -i BAK server.js"
  },
  "keywords": [],
  "author": "xuchang",
  "license": "ISC",
  "description": "",
  "dependencies": {
    "express": "^5.1.0",
    "nodemon": "^3.1.10",
    "socket.io": "^4.8.1",
    "uuid": "^11.1.0"
  }
}
```

# 其他
1. 端口默认是3080，也可以自定义其他端口；
2. 如果你使用了宝塔面板，可以按如下步骤进行部署：

打开宝塔文件管理，/www/wwwroot/路径中新建文件夹，比如pzxznode
完整文件夹：/www/wwwroot/pzxznode
将本地nodejs项目打包后上传并解压，包含：
node_modules文件夹
public文件夹
package.json
package-lock.json
server.js

/www/wwwroot/pzxznode中新建Dockerfil
```Dockerfile
# Use the official Node.js image
FROM node:24-alpine

# Set the working directory
WORKDIR /usr/src/app

# Copy package.json and package-lock.json
COPY package*.json ./

# Install dependencies
# RUN npm install

# Copy the rest of the application code
COPY . .

# Expose the port the app runs on
EXPOSE 3080

# Command to run the application
CMD ["node", "server.js"]
```

转到宝塔的终端，本地服务器中输入指令：
```bash
cd /www/wwwroot/pzxznode
```
接着将项目打包为镜像：（最后的那个.千万不可以漏掉）
```bash
docker build -t pzxzweb .
```
pzxzweb为我自定义的名称，汝可以改成其他。

最后自定义装载镜像的容器名，并在3080端口上运行
```bash
docker run -p 3080:3080 --name shynode pzxzweb
```
shynode为我自定义的名称，汝可以改成其他。

宝塔容器中找到shynode，点击它对应的管理按钮，可查看文件展示（详见shynode_details）
重启策略中，修改设置为“停止后马上重启”。

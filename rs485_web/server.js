const express = require("express");
const ModbusRTU = require("modbus-serial");
const http = require("http");
const socketIo = require("socket.io");

// 创建 MODBUS 客户端
const client = new ModbusRTU();

// 创建 Express 服务器
const app = express();
const server = http.createServer(app);
const io = socketIo(server);

app.use(express.static("public"));

// 连接到串口
client.connectRTUBuffered("COM6", { baudRate: 9600, parity: "none", stopBits: 1, dataBits: 8 })
    .then(() => {
        console.log("串口连接成功");
        io.emit("log", "串口连接成功");
        client.setID(1); // 设备地址
    })
    .catch((error) => {
        console.error("串口连接失败", error);
        io.emit("log", "串口连接失败: " + error.message);
    });

io.on("connection", (socket) => {
    console.log("前端已连接");
    socket.emit("log", "前端已连接");

    socket.on("sendCommand", async (command) => {
        try {
            console.log("发送指令: ", byteArrayToHex(command));
            io.emit("log", `发送指令: ${byteArrayToHex(command)}`);

            // 读取寄存器
            const register = (command[2] << 8) | command[3];
            const data = await client.readHoldingRegisters(register, 1);
            console.log("data = ",data);
            // 解析数据
            const value = data.data[0] / 100; // 假设单位是 0.01V / 0.01A
            const powerValue = data.data[0] ;
            
            console.log(`寄存器 0x${register.toString(16).toUpperCase()} 响应数据: ${value}`);
            io.emit("log", `收到数据: 0x${register.toString(16).toUpperCase()} = ${value}`);

            // 发送到前端
            if (register === 0x52) {
                io.emit("data", { voltage: value });
            } else if (register === 0x55) {
                io.emit("data", { current: value });
            } else if (register === 0x5B){
                io.emit("data", { power: powerValue});
            } else if (register === 0x54){//充电电流
                io.emit("data", { charge_cur: value});
            }else if (register === 0x22){//充电模式 
                io.emit("data", { outPut_style: powerValue});
            }else if (register === 0x56){//充电状态
                io.emit("data", { charge_state: powerValue});
            }
        } catch (error) {
            console.error("读取失败", error);
            io.emit("log", "读取失败: " + error.message);
        }
    });

    socket.on("get7DaysData", async () => {
        try {
            // 近7天发电量寄存器 0x60~0x64
            const chargeRegs = [0x60, 0x61, 0x62, 0x63, 0x64];
            for (let i = 0; i < chargeRegs.length; i++) {
                io.emit("log", `读取发电量寄存器: 0x${chargeRegs[i].toString(16).toUpperCase()}`);
                const data = await client.readHoldingRegisters(chargeRegs[i], 1);
                io.emit("log", `发电量 Day${i+1}: ${data.data[0]}`);
                socket.emit("sevenDayDataItem", { type: "charge", day: i, value: data.data[0] });
            }
            // 近7天放电量寄存器 0x67~0x6B
            const loadRegs = [0x67, 0x68, 0x69, 0x6A, 0x6B];
            for (let i = 0; i < loadRegs.length; i++) {
                io.emit("log", `读取放电量寄存器: 0x${loadRegs[i].toString(16).toUpperCase()}`);
                const data = await client.readHoldingRegisters(loadRegs[i], 1);
                io.emit("log", `放电量 Day${i+1}: ${data.data[0]}`);
                socket.emit("sevenDayDataItem", { type: "load", day: i, value: data.data[0] });
            }
        } catch (error) {
            console.error("读取近7天数据失败", error);
            socket.emit("log", "读取近7天数据失败: " + error.message);
        }
    });
});

// 辅助函数：将字节数组转换为十六进制字符串
function byteArrayToHex(byteArray) {
    return Array.from(byteArray, byte => byte.toString(16).padStart(2, "0")).join(" ").toUpperCase();
}

server.listen(3000, () => console.log("服务器运行在 http://localhost:3000"));
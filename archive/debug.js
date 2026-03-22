const { spawn } = require('child_process');

const server = spawn('node', ['server.js']);

server.stdout.on('data', (data) => console.log('STDOUT:', data.toString()));
server.stderr.on('data', (data) => console.error('STDERR:', data.toString()));

setTimeout(async () => {
    console.log("Sending SUCCESSFUL login...");
    try {
        const res = await fetch('http://localhost:3000/api/login', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({username: "Admin", password: "Phamchithanh@1510"})
        });
        const text = await res.text();
        console.log("SUCCESS LOGIN RESP:", text);
    } catch(err) {
        console.log("FETCH ERR:", err);
    }
    
    setTimeout(() => {
        server.kill();
        process.exit(0);
    }, 1000);
}, 2000);

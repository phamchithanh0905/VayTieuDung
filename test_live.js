const fetch = require('node-fetch');

async function test() {
    try {
        const res = await fetch('https://vaytieudung.onrender.com/api/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: "khachhang1", password: "123" })
        });
        const data = await res.json();
        console.log("LOGIN RESP:", data);
        
        if (data.token) {
            const h = { 'Authorization': 'Bearer ' + data.token };
            const lRes = await fetch('https://vaytieudung.onrender.com/api/loans?customerId=' + data.user.id, { headers: h });
            console.log("LOANS RESP:", await lRes.json());
        }
    } catch (e) {
        console.error(e);
    }
}
test();

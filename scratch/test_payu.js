const https = require("https");
const crypto = require("crypto");

const key = "xl21jd";
const salt = "BCo90vcr0O2mgQMJFPwBiz8j6mBAGw4D";
const txnid = "CBL_" + Date.now();
const amount = "50.00";
const productinfo = "CIBIL Report";
const firstname = "Mohammad";
const email = "shahnawaz844536@gmail.com";
const phone = "9898989898";
const surl = "http://localhost:5173/download-cibil?payment_status=success";
const furl = "http://localhost:5173/download-cibil?payment_status=failed";

const hashString = `${key}|${txnid}|${amount}|${productinfo}|${firstname}|${email}|||||||||||${salt}`;
const hash = crypto.createHash("sha512").update(hashString).digest("hex");

const postData = new URLSearchParams({
  key,
  txnid,
  amount,
  productinfo,
  firstname,
  email,
  phone,
  surl,
  furl,
  hash,
  service_provider: "payu_paisa",
}).toString();

const req = https.request(
  "https://test.payu.in/_payment",
  {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "Content-Length": Buffer.byteLength(postData),
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
    },
  },
  (res) => {
    let body = "";
    res.on("data", (d) => (body += d));
    res.on("end", () => {
      console.log("Full body length:", body.length);
      console.log(body);
    });
  }
);
req.on("error", (e) => console.error(e));
req.write(postData);
req.end();

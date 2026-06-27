import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.join(__dirname, "../.env.local") });

async function test() {
  const { generateAccessToken } = await import("../src/lib/auth/jwt");
  const axios = (await import("axios")).default;

  const userId = "a1db0131-48ad-4a05-a66b-6e4179981c1a";
  const email = "tirth@kovari.in"; // or whatever email they have
  
  const token = generateAccessToken(userId, email);
  console.log("Generated Token:", token);
  
  try {
    const res = await axios.get("http://127.0.0.1:3000/api/direct-chat/inbox", {
      headers: {
        Authorization: `Bearer ${token}`
      }
    });
    console.log("Status:", res.status);
    console.log("Response Data:", JSON.stringify(res.data, null, 2));
  } catch (err: any) {
    console.error("Error calling API:", err.response?.status, err.response?.data || err.message);
  }
}

test().catch(console.error);

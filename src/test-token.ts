import { generateToken } from "./token";

const sessionToken = "0123456789abcdef0123456789abcdef"; // Replace with your real session token
const phone = 1234567890; // Replace with your real phone number

try {
  const result = generateToken(sessionToken, phone, "PRIMARY", 1700000000);
  console.log("Output:", result);
} catch (err) {
  console.error("Error:", err instanceof Error ? err.message : String(err));
}
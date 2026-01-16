const redis = require('redis');

let client;

async function getClient() {
  if (!client) {
    client = redis.createClient({ 
      url: process.env.REDIS_URL || 'redis://localhost:6379' 
    });
    
    client.on('error', err => console.error('Redis Client Error:', err));
    
    if (!client.isOpen) {
      await client.connect();
    }
  }
  return client;
}

async function addToBlacklist(token) {
  try {
    const { jwtVerify } = await import('jose');
    const secret = Buffer.from(process.env.SECRET_TOKEN || 'your-secret-key-here');
    const { payload } = await jwtVerify(token, secret);
    
    const expiresIn = payload.exp - Math.floor(Date.now() / 1000);
    
    if (expiresIn > 0) {
      const redisClient = await getClient();
      await redisClient.setEx(`blacklist:${token}`, expiresIn, '1');
      console.log(`Token blacklisted for ${expiresIn} seconds`);
    }
  } catch (error) {
    console.error('Error blacklisting token:', error);
  }
}

async function isBlacklisted(token) {
  try {
    const redisClient = await getClient();
    const result = await redisClient.get(`blacklist:${token}`);
    return result === '1';
  } catch (error) {
    console.error('Error checking blacklist:', error);
    return false; // Fail open - don't block if Redis is down
  }
}

module.exports = {
  addToBlacklist,
  isBlacklisted
};

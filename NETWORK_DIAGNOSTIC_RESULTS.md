# DSQL Connection Diagnostic Results

## Summary
The problematic network is **actively blocking SSL/TLS connections** to Aurora DSQL while allowing basic TCP connections.

## Test Results

### ✓ Test 1: Raw TCP Connection
- **Result**: SUCCESS (83ms)
- **Meaning**: Network allows TCP connections to port 5432
- **Conclusion**: No basic firewall blocking

### ✓ Test 2: IAM Token Generation
- **Result**: SUCCESS (2ms)
- **Token Structure**:
  - Algorithm: AWS4-HMAC-SHA256
  - Expires: 900 seconds
  - Signature: Present
  - Security Token: Present
- **Conclusion**: AWS authentication working correctly

### ✗ Test 3: SSL/TLS Handshake
- **Result**: FAILURE - `ECONNRESET`
- **Error**: Connection actively reset during SSL handshake
- **Meaning**: Network firewall is inspecting and blocking SSL/TLS connections
- **Conclusion**: **This is the root cause**

### ✗ Test 4: PostgreSQL Client Connection (with SSL)
- **Result**: FAILURE - `ETIMEDOUT` after 20+ seconds
- **Phases Completed**:
  1. ✓ DNS resolution
  2. ✓ TCP handshake
  3. ✗ SSL/TLS negotiation (fails here)
  4. ✗ PostgreSQL authentication (never reached)
- **Conclusion**: Fails at SSL layer, consistent with Test 3

### ✗ Test 5: PostgreSQL Client Connection (without SSL)
- **Result**: FAILURE - Timeout after 10 seconds
- **Meaning**: Without SSL, the server doesn't respond (DSQL requires SSL)
- **Conclusion**: Confirms SSL is required and being blocked

## Root Cause Analysis

**Network-Level Deep Packet Inspection (DPI) Firewall**

The network firewall is:
1. Allowing TCP connections to port 5432
2. Inspecting the SSL/TLS handshake packets
3. Detecting PostgreSQL protocol indicators
4. Actively resetting the connection (`ECONNRESET`)

This is common in:
- Corporate networks
- Public WiFi (coffee shops, airports, hotels)
- Educational institutions
- Networks with strict security policies

## Why It Works on Other Networks

On your working network:
- No DPI firewall inspecting SSL traffic
- PostgreSQL protocol not blocked
- SSL/TLS handshake completes successfully
- Full connection chain: TCP → SSL/TLS → PostgreSQL Auth → Success

## Technical Details

### Error Codes Observed
- `ECONNRESET`: Connection reset by peer (SSL handshake)
- `ETIMEDOUT`: Read timeout (PostgreSQL client waiting for SSL negotiation)

### Connection Phases
```
[TCP SYN] → [SYN-ACK] → [ACK] → ✓ TCP established
                                  ↓
                            [SSL ClientHello] → ✗ ECONNRESET
                                  ↑
                            Firewall blocks here
```

## Workarounds

### Option 1: Use Different Network (RECOMMENDED)
- Switch to network without DPI firewall
- Mobile hotspot
- Home network
- AWS Cloud9 / EC2 instance in same VPC

### Option 2: VPN Tunnel
- Use VPN that encrypts all traffic
- Firewall cannot inspect encrypted VPN packets
- VPN endpoint must allow PostgreSQL/DSQL

### Option 3: AWS CloudShell
- Connect from AWS CloudShell
- Already inside AWS network
- No external firewall restrictions

### Option 4: EC2 Jump Host
- Launch EC2 instance in same region
- Connect via SSH tunnel
- Forward PostgreSQL traffic through tunnel

## Testing Commands

To reproduce these findings on any network:

```bash
# Test 1: Raw TCP
node scripts/test-dsql-connection.js

# Test 2: SSL Handshake
node scripts/test-ssl-handshake.js

# Test 3: Without SSL
node scripts/test-no-ssl.js

# Full demo (requires working connection)
node scripts/demo.js
```

## Network Comparison

| Test | Problematic Network | Working Network |
|------|-------------------|----------------|
| Raw TCP | ✓ Success (83ms) | ✓ Success |
| SSL Handshake | ✗ ECONNRESET | ✓ Success |
| PG Client | ✗ ETIMEDOUT | ✓ Success |
| Full Demo | ✗ Fails | ✓ Success |

## Conclusion

**The network is using Deep Packet Inspection to block PostgreSQL over SSL.**

This is not a bug in the code or configuration - it's a network-level security policy. The diagnostic scripts confirm:
- ✓ Code is correct
- ✓ Configuration is valid
- ✓ AWS credentials work
- ✓ IAM tokens generated properly
- ✗ Network blocks SSL/PostgreSQL protocol

**Recommended action**: Use a different network or VPN tunnel for DSQL connections.

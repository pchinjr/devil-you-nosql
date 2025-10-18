# Using Tailscale to Bypass Network Restrictions

## Overview
Tailscale creates an encrypted WireGuard VPN tunnel that the DPI firewall cannot inspect. By routing your DSQL traffic through a Tailscale exit node or subnet router on an unrestricted network, you can bypass the SSL/PostgreSQL blocking.

## Solution Options

### Option 1: Tailscale Exit Node (Simplest)
Use a Tailscale exit node on a machine that has unrestricted DSQL access.

#### Setup Steps:

1. **Enable Exit Node on unrestricted machine** (home computer, cloud VM, etc.):
   ```bash
   # On the machine with unrestricted network access
   sudo tailscale up --advertise-exit-node

   # Approve in Tailscale admin console:
   # https://login.tailscale.com/admin/machines
   # Click the machine → Edit route settings → Use as exit node
   ```

2. **Use the Exit Node from your restricted network**:
   ```bash
   # On your current machine (with restricted network)
   tailscale up --exit-node=<exit-node-name-or-ip>

   # Example:
   # tailscale up --exit-node=home-macbook
   # or
   # tailscale up --exit-node=100.64.1.2
   ```

3. **Verify your traffic is routed**:
   ```bash
   # Check your exit node status
   tailscale status

   # Test external IP (should show exit node's IP)
   curl ifconfig.me
   ```

4. **Run your DSQL demo**:
   ```bash
   node scripts/demo.js
   ```

5. **When done, disable exit node**:
   ```bash
   tailscale up --exit-node=
   ```

**Pros**:
- All traffic goes through exit node
- Simple one-command setup
- Works immediately

**Cons**:
- Routes ALL internet traffic through exit node
- Requires another machine with unrestricted access

---

### Option 2: Tailscale Subnet Router to AWS VPC (Advanced)
Route only AWS traffic through Tailscale by setting up a subnet router in AWS.

#### Setup Steps:

1. **Launch EC2 instance in us-east-1** (same region as DSQL):
   ```bash
   # Launch t4g.nano (cheapest ARM instance, ~$0.0042/hour)
   aws ec2 run-instances \
     --image-id ami-0c55b159cbfafe1f0 \
     --instance-type t4g.nano \
     --region us-east-1 \
     --tag-specifications 'ResourceType=instance,Tags=[{Key=Name,Value=tailscale-router}]'
   ```

2. **Install Tailscale on EC2**:
   ```bash
   # SSH into EC2 instance
   ssh ec2-user@<ec2-public-ip>

   # Install Tailscale
   curl -fsSL https://tailscale.com/install.sh | sh

   # Enable IP forwarding
   echo 'net.ipv4.ip_forward = 1' | sudo tee -a /etc/sysctl.conf
   sudo sysctl -p /etc/sysctl.conf
   ```

3. **Advertise subnet routes** (AWS CIDR ranges):
   ```bash
   # On EC2 instance
   sudo tailscale up --advertise-routes=18.97.0.0/16
   # Note: 18.97.0.0/16 covers your DSQL endpoint (18.97.33.130)

   # Or advertise entire us-east-1 range:
   # sudo tailscale up --advertise-routes=52.0.0.0/8,18.0.0.0/8
   ```

4. **Accept subnet routes in Tailscale admin**:
   - Go to https://login.tailscale.com/admin/machines
   - Find your EC2 instance
   - Click "Edit route settings"
   - Check "Use as subnet router"
   - Approve the advertised routes

5. **On your local machine, accept routes**:
   ```bash
   tailscale up --accept-routes
   ```

6. **Verify routing**:
   ```bash
   # Check Tailscale status shows subnet routes
   tailscale status

   # Test route to DSQL endpoint
   traceroute k5thfcfex7lpspkky4rppemiz4.dsql.us-east-1.on.aws
   # Should show traffic going through Tailscale (100.x.x.x addresses)
   ```

7. **Run your demo**:
   ```bash
   node scripts/demo.js
   ```

**Pros**:
- Only AWS traffic goes through tunnel
- Other internet traffic unaffected
- More efficient than full exit node

**Cons**:
- More complex setup
- Requires EC2 instance (small cost)

---

### Option 3: Tailscale MagicDNS + SSH Tunnel (Hybrid)
Use Tailscale to SSH into a machine, then create SSH tunnel for port forwarding.

#### Setup Steps:

1. **Ensure Tailscale MagicDNS is enabled**:
   - Go to https://login.tailscale.com/admin/dns
   - Enable MagicDNS

2. **SSH to unrestricted machine via Tailscale**:
   ```bash
   # SSH through Tailscale network (no public IP needed)
   ssh user@machine-name.tail-scale.ts.net

   # Example:
   # ssh paul@home-macbook.tail-scale.ts.net
   ```

3. **Create SSH tunnel for port 5432**:
   ```bash
   ssh -L 5432:k5thfcfex7lpspkky4rppemiz4.dsql.us-east-1.on.aws:5432 \
       user@machine-name.tail-scale.ts.net -N
   ```

4. **Update your .env to use localhost**:
   ```bash
   # Edit .env
   DSQL_ENDPOINT="localhost"
   ```

5. **Run demo**:
   ```bash
   node scripts/demo.js
   ```

**Pros**:
- Minimal changes to workflow
- Only DSQL traffic tunneled
- Uses existing Tailscale infrastructure

**Cons**:
- Requires manual tunnel setup each time
- Needs another machine with unrestricted access

---

## Quick Start: Which Option to Use?

### Use **Option 1 (Exit Node)** if:
- ✓ You have another computer/server with unrestricted network
- ✓ You want the simplest setup
- ✓ You don't mind all traffic going through tunnel temporarily

### Use **Option 2 (Subnet Router)** if:
- ✓ You want permanent solution
- ✓ You only want AWS traffic tunneled
- ✓ You're comfortable with AWS/EC2

### Use **Option 3 (SSH Tunnel)** if:
- ✓ You want minimal changes
- ✓ You only need DSQL, not other AWS services
- ✓ You prefer SSH-based solutions

---

## Troubleshooting

### Exit node not working
```bash
# Check Tailscale status
tailscale status

# Verify exit node is active
# Should show "exit node" in status output

# Test if traffic is routed
curl ifconfig.me
# Should show exit node's public IP, not your local network IP
```

### Subnet routes not working
```bash
# Check routes are accepted
tailscale status | grep route

# Force route refresh
sudo tailscale up --accept-routes --reset

# Test specific route
ip route get 18.97.33.130
# Should show via 100.x.x.x (Tailscale interface)
```

### Performance issues
```bash
# Check Tailscale connection quality
tailscale ping <exit-node-or-subnet-router>

# Use faster exit node closer to AWS region
# Or use subnet router in same AWS region
```

---

## Testing Your Setup

Once Tailscale tunnel is active, verify it works:

```bash
# 1. Test raw TCP (should succeed now)
node scripts/test-dsql-connection.js

# 2. Test SSL handshake (should succeed now)
node scripts/test-ssl-handshake.js

# 3. Run full demo
node scripts/demo.js
```

All tests should pass once traffic is routed through Tailscale!

---

## Cost Comparison

| Option | Cost | Setup Time | Complexity |
|--------|------|------------|------------|
| Exit Node (existing machine) | Free | 2 minutes | Easy |
| Exit Node (cloud VM) | ~$5/month | 10 minutes | Easy |
| Subnet Router (EC2 t4g.nano) | ~$3/month | 15 minutes | Medium |
| SSH Tunnel | Free | 1 minute | Easy |

---

## My Recommendation

**Start with Option 1 (Exit Node)** using a home computer or cloud VM you already have:

```bash
# On unrestricted machine:
sudo tailscale up --advertise-exit-node

# Approve in admin console
# Then on your current machine:
tailscale up --exit-node=<machine-name>

# Test:
node scripts/demo.js

# Done!
```

This takes 2 minutes and works immediately.

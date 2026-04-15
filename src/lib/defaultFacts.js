/**
 * defaultFacts.js
 * Default Ansible mock facts used for Dry-Run evaluation
 * and Jinja2 template rendering.
 */
export const DEFAULT_FACTS = {
  ansible_os_family: "Debian",
  ansible_distribution: "Ubuntu",
  ansible_distribution_version: "22.04",
  ansible_hostname: "web-01",
  ansible_fqdn: "web-01.example.com",
  ansible_default_ipv4: {
    address: "192.168.1.10",
    interface: "eth0"
  },
  ansible_memtotal_mb: 4096,
  ansible_processor_cores: 2,
  ansible_architecture: "x86_64",
  ansible_env: {
    HOME: "/root",
    PATH: "/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin"
  },
  ansible_user_id: "root",
  inventory_hostname: "web-01",
  groups: {
    all: ["web-01", "web-02"],
    web_servers: ["web-01", "web-02"],
    db_servers: ["db-01"]
  }
}

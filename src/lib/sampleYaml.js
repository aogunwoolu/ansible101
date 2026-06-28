export const SAMPLE_YAML = `---
- name: Configure Webserver
  hosts: web_servers
  become: yes
  vars:
    app_port: 8080
    app_user: deploy

  tasks:
    - name: Install nginx
      apt:
        name: nginx
        state: present
        update_cache: yes

    - name: Deploy nginx config
      template:
        src: nginx.conf.j2
        dest: /etc/nginx/nginx.conf
      notify: Restart nginx

    - name: Start and enable nginx
      service:
        name: nginx
        state: started
        enabled: yes

    - name: Configure firewall
      shell: ufw allow {{ app_port }}/tcp
      when: ansible_os_family == "Debian"

    - name: Create app directories
      file:
        path: /var/www/app
        state: directory
        owner: "{{ app_user }}"
        mode: '0755'
      loop:
        - /var/www/app
        - /var/www/app/logs
        - /var/www/app/tmp

    - name: Deploy app files
      copy:
        src: dist/
        dest: /var/www/app/
        owner: "{{ app_user }}"

  handlers:
    - name: Restart nginx
      service:
        name: nginx
        state: restarted
`

// A single task for the Snippet "Quick Card" decoder. Showcases a module with
// arguments, a Jinja2-templated value, a condition, a handler notification, and
// a registered result.
export const SAMPLE_SNIPPET = `# Paste a single Ansible task here to decode it.
- name: Ensure nginx is installed and running
  apt:
    name: "{{ web_package | default('nginx') }}"
    state: present
    update_cache: yes
  when: ansible_os_family == "Debian"
  notify: Restart nginx
  register: nginx_install
`

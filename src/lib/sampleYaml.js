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

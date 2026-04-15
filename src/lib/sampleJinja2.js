export const SAMPLE_JINJA2 = `{{ groups['webservers'] | map(attribute='inventory_hostname') | sort | join(', ') }}`

import os
import re

app_dir = "apps/next-market"
alert_pattern = re.compile(r'\balert\s*\(')
confirm_pattern = re.compile(r'\bconfirm\s*\(')

for root, dirs, files in os.walk(app_dir):
    for file in files:
        if file.endswith(".tsx") or file.endswith(".ts"):
            filepath = os.path.join(root, file)
            with open(filepath, "r") as f:
                content = f.read()
            
            new_content = alert_pattern.sub('console.error(', content)
            new_content = confirm_pattern.sub('true || confirm(', new_content)  # Replace confirm with 'true || confirm(' to mock truthy? No just 'true /* confirm bypassed */ && (' wait, confirm returns boolean. So replace `confirm(` with `(true || confirm(` ? No! Just `true || window.confirm`
            # Actually let's just use `(true)`
            new_content = confirm_pattern.sub('(true) /* bypassed */ //', new_content) # Wait, confirm(...) needs the closing paren to be valid.
            
            if new_content != content:
                print(f"Updated {filepath}")
                # with open(filepath, "w") as f: f.write(new_content)

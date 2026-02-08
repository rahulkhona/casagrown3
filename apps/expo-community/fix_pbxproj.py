#!/usr/bin/env python3
"""Fix react-native-xcode.sh path quoting in project.pbxproj for paths with spaces."""
import sys

p = 'ios/CasagrownCommunity.xcodeproj/project.pbxproj'
with open(p, 'r') as f:
    content = f.read()

# The problematic pattern (backtick execution, unquoted result)
old = '`\\"$NODE_BINARY\\" --print \\"require(\'path\').dirname(require.resolve(\'react-native/package.json\')) + \'/scripts/react-native-xcode.sh\'\\"`'

# Fix: store path in a variable and execute with quotes
new = 'REACT_NATIVE_XCODE_PATH=$(\\"$NODE_BINARY\\" --print \\"require(\'path\').dirname(require.resolve(\'react-native/package.json\')) + \'/scripts/react-native-xcode.sh\'\\")\\n\\"$REACT_NATIVE_XCODE_PATH\\"'

if old in content:
    content = content.replace(old, new)
    with open(p, 'w') as f:
        f.write(content)
    print('PATCHED successfully')
else:
    print('Pattern not found, dumping context...')
    idx = content.find('react-native-xcode')
    if idx >= 0:
        print(repr(content[max(0,idx-150):idx+200]))
    else:
        print('react-native-xcode not found in file at all')
    sys.exit(1)

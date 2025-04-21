#!/bin/bash

# Fix imports in core package
cd packages/core/src

# Replace @/abstract, @/config, @/constants, @/types, @/utils with relative imports
find . -type f -name "*.ts" -exec sed -i '' 's|@/abstract|../abstract|g' {} \;
find . -type f -name "*.ts" -exec sed -i '' 's|@/config|../config|g' {} \;
find . -type f -name "*.ts" -exec sed -i '' 's|@/constants|../constants|g' {} \;
find . -type f -name "*.ts" -exec sed -i '' 's|@/types|../types|g' {} \;
find . -type f -name "*.ts" -exec sed -i '' 's|@/utils|../utils|g' {} \;

echo "Import paths fixed in packages/core/src"

!/bin/bash

curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.4/install.sh | bash
\. "$HOME/.nvm/nvm.sh"
nvm install node
node -v
npm -v

npm install -g @earendil-works/pi-coding-agent

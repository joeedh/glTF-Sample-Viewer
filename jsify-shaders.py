import os, sys, time, random

for root, dir, files in os.walk("./source"):
  for f in files:
    path = os.path.join(root, f)
    print(path)

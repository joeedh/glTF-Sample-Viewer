import os, sys, time, random

def glslFile(path):
  with open(path, "rb") as file:
    buf = file.read()

  buf = str(buf, "utf8")
  buf = """export default `%s`;
""" % (buf)

  print(path + ".js")
  #os.system("git add " + path + ".js")

  with open(path + ".js", "w") as file:
    file.write(buf)


for root, dir, files in os.walk("./source"):
  for f in files:
    path = os.path.join(root, f)
    if path.lower().endswith(".glsl") or path.lower().endswith(".frag") or path.lower().endswith(".vert"):
      glslFile(path)


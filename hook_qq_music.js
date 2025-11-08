const TARGET_DLL = "QQMusicCommon.dll";

function findExport(name) {
  var addr = Module.findExportByName(TARGET_DLL, name);
  if (!addr) throw new Error("找不到导出: " + name);
  return addr;
}

var EncAndDesMediaFileConstructorAddr = findExport("??0EncAndDesMediaFile@@QAE@XZ");
var EncAndDesMediaFileDestructorAddr  = findExport("??1EncAndDesMediaFile@@QAE@XZ");
var EncAndDesMediaFileOpenAddr        = findExport("?Open@EncAndDesMediaFile@@QAE_NPB_W_N1@Z");
var EncAndDesMediaFileGetSizeAddr     = findExport("?GetSize@EncAndDesMediaFile@@QAEKXZ");
var EncAndDesMediaFileReadAddr        = findExport("?Read@EncAndDesMediaFile@@QAEKPAEK_J@Z");

var EncAndDesMediaFileConstructor = new NativeFunction(EncAndDesMediaFileConstructorAddr, "pointer", ["pointer"], "thiscall");
var EncAndDesMediaFileDestructor  = new NativeFunction(EncAndDesMediaFileDestructorAddr, "void", ["pointer"], "thiscall");
var EncAndDesMediaFileOpen        = new NativeFunction(EncAndDesMediaFileOpenAddr, "bool", ["pointer", "pointer", "bool", "bool"], "thiscall");
var EncAndDesMediaFileGetSize     = new NativeFunction(EncAndDesMediaFileGetSizeAddr, "uint32", ["pointer"], "thiscall");
var EncAndDesMediaFileRead        = new NativeFunction(EncAndDesMediaFileReadAddr, "uint", ["pointer", "pointer", "uint32", "uint64"], "thiscall");

rpc.exports = {
  decrypt: function (srcFileName, tmpFileName) {
    try {
      send({ info: "开始解密", src: srcFileName, dst: tmpFileName });

      // 构造对象
      var EncAndDesMediaFileObject = Memory.alloc(0x28);
      EncAndDesMediaFileConstructor(EncAndDesMediaFileObject);

      // open
      var fileNameUtf16 = Memory.allocUtf16String(srcFileName);
      var ok = EncAndDesMediaFileOpen(EncAndDesMediaFileObject, fileNameUtf16, 1, 0);
      if (!ok) {
        EncAndDesMediaFileDestructor(EncAndDesMediaFileObject);
        throw new Error("EncAndDesMediaFile::Open 返回 false —— 源文件不存在或路径错误（请确认路径是完整的绝对路径且使用双反斜杠）");
      }

      // size
      var fileSize = EncAndDesMediaFileGetSize(EncAndDesMediaFileObject);
      if (fileSize === 0) {
        EncAndDesMediaFileDestructor(EncAndDesMediaFileObject);
        throw new Error("文件大小为 0（可能打开失败）");
      }

      // read
      var buffer = Memory.alloc(fileSize);
      var readBytes = EncAndDesMediaFileRead(EncAndDesMediaFileObject, buffer, fileSize, 0);
      EncAndDesMediaFileDestructor(EncAndDesMediaFileObject);

      if (readBytes === 0) {
        throw new Error("Read 返回 0 字节");
      }

      var data = buffer.readByteArray(readBytes);

      // 写入前做简单的路径检查：把目录换成 Windows 临时目录，或确保目录存在
      // 推荐：先测试写入 C:\\Windows\\Temp\\out.bin，确认权限没问题
      try {
        var tmpFile = new File(tmpFileName, "wb");
      } catch (e) {
        // 更详细的错误提示
        throw new Error("打开输出文件失败: " + tmpFileName + "；请确保目录存在并且有写权限。内部错误: " + e.message);
      }

      tmpFile.write(data);
      tmpFile.flush && tmpFile.flush();
      tmpFile.close && tmpFile.close();

      send({ ok: true, bytes: readBytes });
      return { success: true, bytes: readBytes };
    } catch (err) {
      // 把错误发送出去，调用端能收到更清晰的原因
      send({ ok: false, error: "" + err.stack || err.message });
      // 抛出异常让调用端也能收到
      throw err;
    }
  }
};

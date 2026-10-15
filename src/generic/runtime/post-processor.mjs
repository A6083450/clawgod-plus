#!/usr/bin/env bun
import { readFileSync, writeFileSync, unlinkSync, readdirSync, existsSync, realpathSync } from 'fs';
import { createHash } from 'crypto';
import { basename, dirname, join } from 'path';
import { fileURLToPath } from 'url';

// Acorn 8.16.0（MIT）：复用仓库已有解析器，保持安装器后处理单文件、离线运行。
const cellAst = (() => {
  const exports = {}, module = { exports };
// BEGIN VENDORED ACORN
(function (global, factory) {
  typeof exports === 'object' && typeof module !== 'undefined' ? factory(exports) :
  typeof define === 'function' && define.amd ? define(['exports'], factory) :
  (global = typeof globalThis !== 'undefined' ? globalThis : global || self, factory(global.acorn = {}));
})(this, (function (exports) { 'use strict';

  // This file was generated. Do not modify manually!
  var astralIdentifierCodes = [509, 0, 227, 0, 150, 4, 294, 9, 1368, 2, 2, 1, 6, 3, 41, 2, 5, 0, 166, 1, 574, 3, 9, 9, 7, 9, 32, 4, 318, 1, 78, 5, 71, 10, 50, 3, 123, 2, 54, 14, 32, 10, 3, 1, 11, 3, 46, 10, 8, 0, 46, 9, 7, 2, 37, 13, 2, 9, 6, 1, 45, 0, 13, 2, 49, 13, 9, 3, 2, 11, 83, 11, 7, 0, 3, 0, 158, 11, 6, 9, 7, 3, 56, 1, 2, 6, 3, 1, 3, 2, 10, 0, 11, 1, 3, 6, 4, 4, 68, 8, 2, 0, 3, 0, 2, 3, 2, 4, 2, 0, 15, 1, 83, 17, 10, 9, 5, 0, 82, 19, 13, 9, 214, 6, 3, 8, 28, 1, 83, 16, 16, 9, 82, 12, 9, 9, 7, 19, 58, 14, 5, 9, 243, 14, 166, 9, 71, 5, 2, 1, 3, 3, 2, 0, 2, 1, 13, 9, 120, 6, 3, 6, 4, 0, 29, 9, 41, 6, 2, 3, 9, 0, 10, 10, 47, 15, 199, 7, 137, 9, 54, 7, 2, 7, 17, 9, 57, 21, 2, 13, 123, 5, 4, 0, 2, 1, 2, 6, 2, 0, 9, 9, 49, 4, 2, 1, 2, 4, 9, 9, 55, 9, 266, 3, 10, 1, 2, 0, 49, 6, 4, 4, 14, 10, 5350, 0, 7, 14, 11465, 27, 2343, 9, 87, 9, 39, 4, 60, 6, 26, 9, 535, 9, 470, 0, 2, 54, 8, 3, 82, 0, 12, 1, 19628, 1, 4178, 9, 519, 45, 3, 22, 543, 4, 4, 5, 9, 7, 3, 6, 31, 3, 149, 2, 1418, 49, 513, 54, 5, 49, 9, 0, 15, 0, 23, 4, 2, 14, 1361, 6, 2, 16, 3, 6, 2, 1, 2, 4, 101, 0, 161, 6, 10, 9, 357, 0, 62, 13, 499, 13, 245, 1, 2, 9, 233, 0, 3, 0, 8, 1, 6, 0, 475, 6, 110, 6, 6, 9, 4759, 9, 787719, 239];

  // This file was generated. Do not modify manually!
  var astralIdentifierStartCodes = [0, 11, 2, 25, 2, 18, 2, 1, 2, 14, 3, 13, 35, 122, 70, 52, 268, 28, 4, 48, 48, 31, 14, 29, 6, 37, 11, 29, 3, 35, 5, 7, 2, 4, 43, 157, 19, 35, 5, 35, 5, 39, 9, 51, 13, 10, 2, 14, 2, 6, 2, 1, 2, 10, 2, 14, 2, 6, 2, 1, 4, 51, 13, 310, 10, 21, 11, 7, 25, 5, 2, 41, 2, 8, 70, 5, 3, 0, 2, 43, 2, 1, 4, 0, 3, 22, 11, 22, 10, 30, 66, 18, 2, 1, 11, 21, 11, 25, 7, 25, 39, 55, 7, 1, 65, 0, 16, 3, 2, 2, 2, 28, 43, 28, 4, 28, 36, 7, 2, 27, 28, 53, 11, 21, 11, 18, 14, 17, 111, 72, 56, 50, 14, 50, 14, 35, 39, 27, 10, 22, 251, 41, 7, 1, 17, 5, 57, 28, 11, 0, 9, 21, 43, 17, 47, 20, 28, 22, 13, 52, 58, 1, 3, 0, 14, 44, 33, 24, 27, 35, 30, 0, 3, 0, 9, 34, 4, 0, 13, 47, 15, 3, 22, 0, 2, 0, 36, 17, 2, 24, 20, 1, 64, 6, 2, 0, 2, 3, 2, 14, 2, 9, 8, 46, 39, 7, 3, 1, 3, 21, 2, 6, 2, 1, 2, 4, 4, 0, 19, 0, 13, 4, 31, 9, 2, 0, 3, 0, 2, 37, 2, 0, 26, 0, 2, 0, 45, 52, 19, 3, 21, 2, 31, 47, 21, 1, 2, 0, 185, 46, 42, 3, 37, 47, 21, 0, 60, 42, 14, 0, 72, 26, 38, 6, 186, 43, 117, 63, 32, 7, 3, 0, 3, 7, 2, 1, 2, 23, 16, 0, 2, 0, 95, 7, 3, 38, 17, 0, 2, 0, 29, 0, 11, 39, 8, 0, 22, 0, 12, 45, 20, 0, 19, 72, 200, 32, 32, 8, 2, 36, 18, 0, 50, 29, 113, 6, 2, 1, 2, 37, 22, 0, 26, 5, 2, 1, 2, 31, 15, 0, 24, 43, 261, 18, 16, 0, 2, 12, 2, 33, 125, 0, 80, 921, 103, 110, 18, 195, 2637, 96, 16, 1071, 18, 5, 26, 3994, 6, 582, 6842, 29, 1763, 568, 8, 30, 18, 78, 18, 29, 19, 47, 17, 3, 32, 20, 6, 18, 433, 44, 212, 63, 33, 24, 3, 24, 45, 74, 6, 0, 67, 12, 65, 1, 2, 0, 15, 4, 10, 7381, 42, 31, 98, 114, 8702, 3, 2, 6, 2, 1, 2, 290, 16, 0, 30, 2, 3, 0, 15, 3, 9, 395, 2309, 106, 6, 12, 4, 8, 8, 9, 5991, 84, 2, 70, 2, 1, 3, 0, 3, 1, 3, 3, 2, 11, 2, 0, 2, 6, 2, 64, 2, 3, 3, 7, 2, 6, 2, 27, 2, 3, 2, 4, 2, 0, 4, 6, 2, 339, 3, 24, 2, 24, 2, 30, 2, 24, 2, 30, 2, 24, 2, 30, 2, 24, 2, 30, 2, 24, 2, 7, 1845, 30, 7, 5, 262, 61, 147, 44, 11, 6, 17, 0, 322, 29, 19, 43, 485, 27, 229, 29, 3, 0, 208, 30, 2, 2, 2, 1, 2, 6, 3, 4, 10, 1, 225, 6, 2, 3, 2, 1, 2, 14, 2, 196, 60, 67, 8, 0, 1205, 3, 2, 26, 2, 1, 2, 0, 3, 0, 2, 9, 2, 3, 2, 0, 2, 0, 7, 0, 5, 0, 2, 0, 2, 0, 2, 2, 2, 1, 2, 0, 3, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 1, 2, 0, 3, 3, 2, 6, 2, 3, 2, 3, 2, 0, 2, 9, 2, 16, 6, 2, 2, 4, 2, 16, 4421, 42719, 33, 4381, 3, 5773, 3, 7472, 16, 621, 2467, 541, 1507, 4938, 6, 8489];

  // This file was generated. Do not modify manually!
  var nonASCIIidentifierChars = "\u200c\u200d\xb7\u0300-\u036f\u0387\u0483-\u0487\u0591-\u05bd\u05bf\u05c1\u05c2\u05c4\u05c5\u05c7\u0610-\u061a\u064b-\u0669\u0670\u06d6-\u06dc\u06df-\u06e4\u06e7\u06e8\u06ea-\u06ed\u06f0-\u06f9\u0711\u0730-\u074a\u07a6-\u07b0\u07c0-\u07c9\u07eb-\u07f3\u07fd\u0816-\u0819\u081b-\u0823\u0825-\u0827\u0829-\u082d\u0859-\u085b\u0897-\u089f\u08ca-\u08e1\u08e3-\u0903\u093a-\u093c\u093e-\u094f\u0951-\u0957\u0962\u0963\u0966-\u096f\u0981-\u0983\u09bc\u09be-\u09c4\u09c7\u09c8\u09cb-\u09cd\u09d7\u09e2\u09e3\u09e6-\u09ef\u09fe\u0a01-\u0a03\u0a3c\u0a3e-\u0a42\u0a47\u0a48\u0a4b-\u0a4d\u0a51\u0a66-\u0a71\u0a75\u0a81-\u0a83\u0abc\u0abe-\u0ac5\u0ac7-\u0ac9\u0acb-\u0acd\u0ae2\u0ae3\u0ae6-\u0aef\u0afa-\u0aff\u0b01-\u0b03\u0b3c\u0b3e-\u0b44\u0b47\u0b48\u0b4b-\u0b4d\u0b55-\u0b57\u0b62\u0b63\u0b66-\u0b6f\u0b82\u0bbe-\u0bc2\u0bc6-\u0bc8\u0bca-\u0bcd\u0bd7\u0be6-\u0bef\u0c00-\u0c04\u0c3c\u0c3e-\u0c44\u0c46-\u0c48\u0c4a-\u0c4d\u0c55\u0c56\u0c62\u0c63\u0c66-\u0c6f\u0c81-\u0c83\u0cbc\u0cbe-\u0cc4\u0cc6-\u0cc8\u0cca-\u0ccd\u0cd5\u0cd6\u0ce2\u0ce3\u0ce6-\u0cef\u0cf3\u0d00-\u0d03\u0d3b\u0d3c\u0d3e-\u0d44\u0d46-\u0d48\u0d4a-\u0d4d\u0d57\u0d62\u0d63\u0d66-\u0d6f\u0d81-\u0d83\u0dca\u0dcf-\u0dd4\u0dd6\u0dd8-\u0ddf\u0de6-\u0def\u0df2\u0df3\u0e31\u0e34-\u0e3a\u0e47-\u0e4e\u0e50-\u0e59\u0eb1\u0eb4-\u0ebc\u0ec8-\u0ece\u0ed0-\u0ed9\u0f18\u0f19\u0f20-\u0f29\u0f35\u0f37\u0f39\u0f3e\u0f3f\u0f71-\u0f84\u0f86\u0f87\u0f8d-\u0f97\u0f99-\u0fbc\u0fc6\u102b-\u103e\u1040-\u1049\u1056-\u1059\u105e-\u1060\u1062-\u1064\u1067-\u106d\u1071-\u1074\u1082-\u108d\u108f-\u109d\u135d-\u135f\u1369-\u1371\u1712-\u1715\u1732-\u1734\u1752\u1753\u1772\u1773\u17b4-\u17d3\u17dd\u17e0-\u17e9\u180b-\u180d\u180f-\u1819\u18a9\u1920-\u192b\u1930-\u193b\u1946-\u194f\u19d0-\u19da\u1a17-\u1a1b\u1a55-\u1a5e\u1a60-\u1a7c\u1a7f-\u1a89\u1a90-\u1a99\u1ab0-\u1abd\u1abf-\u1add\u1ae0-\u1aeb\u1b00-\u1b04\u1b34-\u1b44\u1b50-\u1b59\u1b6b-\u1b73\u1b80-\u1b82\u1ba1-\u1bad\u1bb0-\u1bb9\u1be6-\u1bf3\u1c24-\u1c37\u1c40-\u1c49\u1c50-\u1c59\u1cd0-\u1cd2\u1cd4-\u1ce8\u1ced\u1cf4\u1cf7-\u1cf9\u1dc0-\u1dff\u200c\u200d\u203f\u2040\u2054\u20d0-\u20dc\u20e1\u20e5-\u20f0\u2cef-\u2cf1\u2d7f\u2de0-\u2dff\u302a-\u302f\u3099\u309a\u30fb\ua620-\ua629\ua66f\ua674-\ua67d\ua69e\ua69f\ua6f0\ua6f1\ua802\ua806\ua80b\ua823-\ua827\ua82c\ua880\ua881\ua8b4-\ua8c5\ua8d0-\ua8d9\ua8e0-\ua8f1\ua8ff-\ua909\ua926-\ua92d\ua947-\ua953\ua980-\ua983\ua9b3-\ua9c0\ua9d0-\ua9d9\ua9e5\ua9f0-\ua9f9\uaa29-\uaa36\uaa43\uaa4c\uaa4d\uaa50-\uaa59\uaa7b-\uaa7d\uaab0\uaab2-\uaab4\uaab7\uaab8\uaabe\uaabf\uaac1\uaaeb-\uaaef\uaaf5\uaaf6\uabe3-\uabea\uabec\uabed\uabf0-\uabf9\ufb1e\ufe00-\ufe0f\ufe20-\ufe2f\ufe33\ufe34\ufe4d-\ufe4f\uff10-\uff19\uff3f\uff65";

  // This file was generated. Do not modify manually!
  var nonASCIIidentifierStartChars = "\xaa\xb5\xba\xc0-\xd6\xd8-\xf6\xf8-\u02c1\u02c6-\u02d1\u02e0-\u02e4\u02ec\u02ee\u0370-\u0374\u0376\u0377\u037a-\u037d\u037f\u0386\u0388-\u038a\u038c\u038e-\u03a1\u03a3-\u03f5\u03f7-\u0481\u048a-\u052f\u0531-\u0556\u0559\u0560-\u0588\u05d0-\u05ea\u05ef-\u05f2\u0620-\u064a\u066e\u066f\u0671-\u06d3\u06d5\u06e5\u06e6\u06ee\u06ef\u06fa-\u06fc\u06ff\u0710\u0712-\u072f\u074d-\u07a5\u07b1\u07ca-\u07ea\u07f4\u07f5\u07fa\u0800-\u0815\u081a\u0824\u0828\u0840-\u0858\u0860-\u086a\u0870-\u0887\u0889-\u088f\u08a0-\u08c9\u0904-\u0939\u093d\u0950\u0958-\u0961\u0971-\u0980\u0985-\u098c\u098f\u0990\u0993-\u09a8\u09aa-\u09b0\u09b2\u09b6-\u09b9\u09bd\u09ce\u09dc\u09dd\u09df-\u09e1\u09f0\u09f1\u09fc\u0a05-\u0a0a\u0a0f\u0a10\u0a13-\u0a28\u0a2a-\u0a30\u0a32\u0a33\u0a35\u0a36\u0a38\u0a39\u0a59-\u0a5c\u0a5e\u0a72-\u0a74\u0a85-\u0a8d\u0a8f-\u0a91\u0a93-\u0aa8\u0aaa-\u0ab0\u0ab2\u0ab3\u0ab5-\u0ab9\u0abd\u0ad0\u0ae0\u0ae1\u0af9\u0b05-\u0b0c\u0b0f\u0b10\u0b13-\u0b28\u0b2a-\u0b30\u0b32\u0b33\u0b35-\u0b39\u0b3d\u0b5c\u0b5d\u0b5f-\u0b61\u0b71\u0b83\u0b85-\u0b8a\u0b8e-\u0b90\u0b92-\u0b95\u0b99\u0b9a\u0b9c\u0b9e\u0b9f\u0ba3\u0ba4\u0ba8-\u0baa\u0bae-\u0bb9\u0bd0\u0c05-\u0c0c\u0c0e-\u0c10\u0c12-\u0c28\u0c2a-\u0c39\u0c3d\u0c58-\u0c5a\u0c5c\u0c5d\u0c60\u0c61\u0c80\u0c85-\u0c8c\u0c8e-\u0c90\u0c92-\u0ca8\u0caa-\u0cb3\u0cb5-\u0cb9\u0cbd\u0cdc-\u0cde\u0ce0\u0ce1\u0cf1\u0cf2\u0d04-\u0d0c\u0d0e-\u0d10\u0d12-\u0d3a\u0d3d\u0d4e\u0d54-\u0d56\u0d5f-\u0d61\u0d7a-\u0d7f\u0d85-\u0d96\u0d9a-\u0db1\u0db3-\u0dbb\u0dbd\u0dc0-\u0dc6\u0e01-\u0e30\u0e32\u0e33\u0e40-\u0e46\u0e81\u0e82\u0e84\u0e86-\u0e8a\u0e8c-\u0ea3\u0ea5\u0ea7-\u0eb0\u0eb2\u0eb3\u0ebd\u0ec0-\u0ec4\u0ec6\u0edc-\u0edf\u0f00\u0f40-\u0f47\u0f49-\u0f6c\u0f88-\u0f8c\u1000-\u102a\u103f\u1050-\u1055\u105a-\u105d\u1061\u1065\u1066\u106e-\u1070\u1075-\u1081\u108e\u10a0-\u10c5\u10c7\u10cd\u10d0-\u10fa\u10fc-\u1248\u124a-\u124d\u1250-\u1256\u1258\u125a-\u125d\u1260-\u1288\u128a-\u128d\u1290-\u12b0\u12b2-\u12b5\u12b8-\u12be\u12c0\u12c2-\u12c5\u12c8-\u12d6\u12d8-\u1310\u1312-\u1315\u1318-\u135a\u1380-\u138f\u13a0-\u13f5\u13f8-\u13fd\u1401-\u166c\u166f-\u167f\u1681-\u169a\u16a0-\u16ea\u16ee-\u16f8\u1700-\u1711\u171f-\u1731\u1740-\u1751\u1760-\u176c\u176e-\u1770\u1780-\u17b3\u17d7\u17dc\u1820-\u1878\u1880-\u18a8\u18aa\u18b0-\u18f5\u1900-\u191e\u1950-\u196d\u1970-\u1974\u1980-\u19ab\u19b0-\u19c9\u1a00-\u1a16\u1a20-\u1a54\u1aa7\u1b05-\u1b33\u1b45-\u1b4c\u1b83-\u1ba0\u1bae\u1baf\u1bba-\u1be5\u1c00-\u1c23\u1c4d-\u1c4f\u1c5a-\u1c7d\u1c80-\u1c8a\u1c90-\u1cba\u1cbd-\u1cbf\u1ce9-\u1cec\u1cee-\u1cf3\u1cf5\u1cf6\u1cfa\u1d00-\u1dbf\u1e00-\u1f15\u1f18-\u1f1d\u1f20-\u1f45\u1f48-\u1f4d\u1f50-\u1f57\u1f59\u1f5b\u1f5d\u1f5f-\u1f7d\u1f80-\u1fb4\u1fb6-\u1fbc\u1fbe\u1fc2-\u1fc4\u1fc6-\u1fcc\u1fd0-\u1fd3\u1fd6-\u1fdb\u1fe0-\u1fec\u1ff2-\u1ff4\u1ff6-\u1ffc\u2071\u207f\u2090-\u209c\u2102\u2107\u210a-\u2113\u2115\u2118-\u211d\u2124\u2126\u2128\u212a-\u2139\u213c-\u213f\u2145-\u2149\u214e\u2160-\u2188\u2c00-\u2ce4\u2ceb-\u2cee\u2cf2\u2cf3\u2d00-\u2d25\u2d27\u2d2d\u2d30-\u2d67\u2d6f\u2d80-\u2d96\u2da0-\u2da6\u2da8-\u2dae\u2db0-\u2db6\u2db8-\u2dbe\u2dc0-\u2dc6\u2dc8-\u2dce\u2dd0-\u2dd6\u2dd8-\u2dde\u3005-\u3007\u3021-\u3029\u3031-\u3035\u3038-\u303c\u3041-\u3096\u309b-\u309f\u30a1-\u30fa\u30fc-\u30ff\u3105-\u312f\u3131-\u318e\u31a0-\u31bf\u31f0-\u31ff\u3400-\u4dbf\u4e00-\ua48c\ua4d0-\ua4fd\ua500-\ua60c\ua610-\ua61f\ua62a\ua62b\ua640-\ua66e\ua67f-\ua69d\ua6a0-\ua6ef\ua717-\ua71f\ua722-\ua788\ua78b-\ua7dc\ua7f1-\ua801\ua803-\ua805\ua807-\ua80a\ua80c-\ua822\ua840-\ua873\ua882-\ua8b3\ua8f2-\ua8f7\ua8fb\ua8fd\ua8fe\ua90a-\ua925\ua930-\ua946\ua960-\ua97c\ua984-\ua9b2\ua9cf\ua9e0-\ua9e4\ua9e6-\ua9ef\ua9fa-\ua9fe\uaa00-\uaa28\uaa40-\uaa42\uaa44-\uaa4b\uaa60-\uaa76\uaa7a\uaa7e-\uaaaf\uaab1\uaab5\uaab6\uaab9-\uaabd\uaac0\uaac2\uaadb-\uaadd\uaae0-\uaaea\uaaf2-\uaaf4\uab01-\uab06\uab09-\uab0e\uab11-\uab16\uab20-\uab26\uab28-\uab2e\uab30-\uab5a\uab5c-\uab69\uab70-\uabe2\uac00-\ud7a3\ud7b0-\ud7c6\ud7cb-\ud7fb\uf900-\ufa6d\ufa70-\ufad9\ufb00-\ufb06\ufb13-\ufb17\ufb1d\ufb1f-\ufb28\ufb2a-\ufb36\ufb38-\ufb3c\ufb3e\ufb40\ufb41\ufb43\ufb44\ufb46-\ufbb1\ufbd3-\ufd3d\ufd50-\ufd8f\ufd92-\ufdc7\ufdf0-\ufdfb\ufe70-\ufe74\ufe76-\ufefc\uff21-\uff3a\uff41-\uff5a\uff66-\uffbe\uffc2-\uffc7\uffca-\uffcf\uffd2-\uffd7\uffda-\uffdc";

  // These are a run-length and offset encoded representation of the
  // >0xffff code points that are a valid part of identifiers. The
  // offset starts at 0x10000, and each pair of numbers represents an
  // offset to the next range, and then a size of the range.

  // Reserved word lists for various dialects of the language

  var reservedWords = {
    3: "abstract boolean byte char class double enum export extends final float goto implements import int interface long native package private protected public short static super synchronized throws transient volatile",
    5: "class enum extends super const export import",
    6: "enum",
    strict: "implements interface let package private protected public static yield",
    strictBind: "eval arguments"
  };

  // And the keywords

  var ecma5AndLessKeywords = "break case catch continue debugger default do else finally for function if return switch throw try var while with null true false instanceof typeof void delete new in this";

  var keywords$1 = {
    5: ecma5AndLessKeywords,
    "5module": ecma5AndLessKeywords + " export import",
    6: ecma5AndLessKeywords + " const class extends export import super"
  };

  var keywordRelationalOperator = /^in(stanceof)?$/;

  // ## Character categories

  var nonASCIIidentifierStart = new RegExp("[" + nonASCIIidentifierStartChars + "]");
  var nonASCIIidentifier = new RegExp("[" + nonASCIIidentifierStartChars + nonASCIIidentifierChars + "]");

  // This has a complexity linear to the value of the code. The
  // assumption is that looking up astral identifier characters is
  // rare.
  function isInAstralSet(code, set) {
    var pos = 0x10000;
    for (var i = 0; i < set.length; i += 2) {
      pos += set[i];
      if (pos > code) { return false }
      pos += set[i + 1];
      if (pos >= code) { return true }
    }
    return false
  }

  // Test whether a given character code starts an identifier.

  function isIdentifierStart(code, astral) {
    if (code < 65) { return code === 36 }
    if (code < 91) { return true }
    if (code < 97) { return code === 95 }
    if (code < 123) { return true }
    if (code <= 0xffff) { return code >= 0xaa && nonASCIIidentifierStart.test(String.fromCharCode(code)) }
    if (astral === false) { return false }
    return isInAstralSet(code, astralIdentifierStartCodes)
  }

  // Test whether a given character is part of an identifier.

  function isIdentifierChar(code, astral) {
    if (code < 48) { return code === 36 }
    if (code < 58) { return true }
    if (code < 65) { return false }
    if (code < 91) { return true }
    if (code < 97) { return code === 95 }
    if (code < 123) { return true }
    if (code <= 0xffff) { return code >= 0xaa && nonASCIIidentifier.test(String.fromCharCode(code)) }
    if (astral === false) { return false }
    return isInAstralSet(code, astralIdentifierStartCodes) || isInAstralSet(code, astralIdentifierCodes)
  }

  // ## Token types

  // The assignment of fine-grained, information-carrying type objects
  // allows the tokenizer to store the information it has about a
  // token in a way that is very cheap for the parser to look up.

  // All token type variables start with an underscore, to make them
  // easy to recognize.

  // The `beforeExpr` property is used to disambiguate between regular
  // expressions and divisions. It is set on all token types that can
  // be followed by an expression (thus, a slash after them would be a
  // regular expression).
  //
  // The `startsExpr` property is used to check if the token ends a
  // `yield` expression. It is set on all token types that either can
  // directly start an expression (like a quotation mark) or can
  // continue an expression (like the body of a string).
  //
  // `isLoop` marks a keyword as starting a loop, which is important
  // to know when parsing a label, in order to allow or disallow
  // continue jumps to that label.

  var TokenType = function TokenType(label, conf) {
    if ( conf === void 0 ) conf = {};

    this.label = label;
    this.keyword = conf.keyword;
    this.beforeExpr = !!conf.beforeExpr;
    this.startsExpr = !!conf.startsExpr;
    this.isLoop = !!conf.isLoop;
    this.isAssign = !!conf.isAssign;
    this.prefix = !!conf.prefix;
    this.postfix = !!conf.postfix;
    this.binop = conf.binop || null;
    this.updateContext = null;
  };

  function binop(name, prec) {
    return new TokenType(name, {beforeExpr: true, binop: prec})
  }
  var beforeExpr = {beforeExpr: true}, startsExpr = {startsExpr: true};

  // Map keyword names to token types.

  var keywords = {};

  // Succinct definitions of keyword token types
  function kw(name, options) {
    if ( options === void 0 ) options = {};

    options.keyword = name;
    return keywords[name] = new TokenType(name, options)
  }

  var types$1 = {
    num: new TokenType("num", startsExpr),
    regexp: new TokenType("regexp", startsExpr),
    string: new TokenType("string", startsExpr),
    name: new TokenType("name", startsExpr),
    privateId: new TokenType("privateId", startsExpr),
    eof: new TokenType("eof"),

    // Punctuation token types.
    bracketL: new TokenType("[", {beforeExpr: true, startsExpr: true}),
    bracketR: new TokenType("]"),
    braceL: new TokenType("{", {beforeExpr: true, startsExpr: true}),
    braceR: new TokenType("}"),
    parenL: new TokenType("(", {beforeExpr: true, startsExpr: true}),
    parenR: new TokenType(")"),
    comma: new TokenType(",", beforeExpr),
    semi: new TokenType(";", beforeExpr),
    colon: new TokenType(":", beforeExpr),
    dot: new TokenType("."),
    question: new TokenType("?", beforeExpr),
    questionDot: new TokenType("?."),
    arrow: new TokenType("=>", beforeExpr),
    template: new TokenType("template"),
    invalidTemplate: new TokenType("invalidTemplate"),
    ellipsis: new TokenType("...", beforeExpr),
    backQuote: new TokenType("`", startsExpr),
    dollarBraceL: new TokenType("${", {beforeExpr: true, startsExpr: true}),

    // Operators. These carry several kinds of properties to help the
    // parser use them properly (the presence of these properties is
    // what categorizes them as operators).
    //
    // `binop`, when present, specifies that this operator is a binary
    // operator, and will refer to its precedence.
    //
    // `prefix` and `postfix` mark the operator as a prefix or postfix
    // unary operator.
    //
    // `isAssign` marks all of `=`, `+=`, `-=` etcetera, which act as
    // binary operators with a very low precedence, that should result
    // in AssignmentExpression nodes.

    eq: new TokenType("=", {beforeExpr: true, isAssign: true}),
    assign: new TokenType("_=", {beforeExpr: true, isAssign: true}),
    incDec: new TokenType("++/--", {prefix: true, postfix: true, startsExpr: true}),
    prefix: new TokenType("!/~", {beforeExpr: true, prefix: true, startsExpr: true}),
    logicalOR: binop("||", 1),
    logicalAND: binop("&&", 2),
    bitwiseOR: binop("|", 3),
    bitwiseXOR: binop("^", 4),
    bitwiseAND: binop("&", 5),
    equality: binop("==/!=/===/!==", 6),
    relational: binop("</>/<=/>=", 7),
    bitShift: binop("<</>>/>>>", 8),
    plusMin: new TokenType("+/-", {beforeExpr: true, binop: 9, prefix: true, startsExpr: true}),
    modulo: binop("%", 10),
    star: binop("*", 10),
    slash: binop("/", 10),
    starstar: new TokenType("**", {beforeExpr: true}),
    coalesce: binop("??", 1),

    // Keyword token types.
    _break: kw("break"),
    _case: kw("case", beforeExpr),
    _catch: kw("catch"),
    _continue: kw("continue"),
    _debugger: kw("debugger"),
    _default: kw("default", beforeExpr),
    _do: kw("do", {isLoop: true, beforeExpr: true}),
    _else: kw("else", beforeExpr),
    _finally: kw("finally"),
    _for: kw("for", {isLoop: true}),
    _function: kw("function", startsExpr),
    _if: kw("if"),
    _return: kw("return", beforeExpr),
    _switch: kw("switch"),
    _throw: kw("throw", beforeExpr),
    _try: kw("try"),
    _var: kw("var"),
    _const: kw("const"),
    _while: kw("while", {isLoop: true}),
    _with: kw("with"),
    _new: kw("new", {beforeExpr: true, startsExpr: true}),
    _this: kw("this", startsExpr),
    _super: kw("super", startsExpr),
    _class: kw("class", startsExpr),
    _extends: kw("extends", beforeExpr),
    _export: kw("export"),
    _import: kw("import", startsExpr),
    _null: kw("null", startsExpr),
    _true: kw("true", startsExpr),
    _false: kw("false", startsExpr),
    _in: kw("in", {beforeExpr: true, binop: 7}),
    _instanceof: kw("instanceof", {beforeExpr: true, binop: 7}),
    _typeof: kw("typeof", {beforeExpr: true, prefix: true, startsExpr: true}),
    _void: kw("void", {beforeExpr: true, prefix: true, startsExpr: true}),
    _delete: kw("delete", {beforeExpr: true, prefix: true, startsExpr: true})
  };

  // Matches a whole line break (where CRLF is considered a single
  // line break). Used to count lines.

  var lineBreak = /\r\n?|\n|\u2028|\u2029/;
  var lineBreakG = new RegExp(lineBreak.source, "g");

  function isNewLine(code) {
    return code === 10 || code === 13 || code === 0x2028 || code === 0x2029
  }

  function nextLineBreak(code, from, end) {
    if ( end === void 0 ) end = code.length;

    for (var i = from; i < end; i++) {
      var next = code.charCodeAt(i);
      if (isNewLine(next))
        { return i < end - 1 && next === 13 && code.charCodeAt(i + 1) === 10 ? i + 2 : i + 1 }
    }
    return -1
  }

  var nonASCIIwhitespace = /[\u1680\u2000-\u200a\u202f\u205f\u3000\ufeff]/;

  var skipWhiteSpace = /(?:\s|\/\/.*|\/\*[^]*?\*\/)*/g;

  var ref = Object.prototype;
  var hasOwnProperty = ref.hasOwnProperty;
  var toString = ref.toString;

  var hasOwn = Object.hasOwn || (function (obj, propName) { return (
    hasOwnProperty.call(obj, propName)
  ); });

  var isArray = Array.isArray || (function (obj) { return (
    toString.call(obj) === "[object Array]"
  ); });

  var regexpCache = Object.create(null);

  function wordsRegexp(words) {
    return regexpCache[words] || (regexpCache[words] = new RegExp("^(?:" + words.replace(/ /g, "|") + ")$"))
  }

  function codePointToString(code) {
    // UTF-16 Decoding
    if (code <= 0xFFFF) { return String.fromCharCode(code) }
    code -= 0x10000;
    return String.fromCharCode((code >> 10) + 0xD800, (code & 1023) + 0xDC00)
  }

  var loneSurrogate = /(?:[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?:[^\uD800-\uDBFF]|^)[\uDC00-\uDFFF])/;

  // These are used when `options.locations` is on, for the
  // `startLoc` and `endLoc` properties.

  var Position = function Position(line, col) {
    this.line = line;
    this.column = col;
  };

  Position.prototype.offset = function offset (n) {
    return new Position(this.line, this.column + n)
  };

  var SourceLocation = function SourceLocation(p, start, end) {
    this.start = start;
    this.end = end;
    if (p.sourceFile !== null) { this.source = p.sourceFile; }
  };

  // The `getLineInfo` function is mostly useful when the
  // `locations` option is off (for performance reasons) and you
  // want to find the line/column position for a given character
  // offset. `input` should be the code string that the offset refers
  // into.

  function getLineInfo(input, offset) {
    for (var line = 1, cur = 0;;) {
      var nextBreak = nextLineBreak(input, cur, offset);
      if (nextBreak < 0) { return new Position(line, offset - cur) }
      ++line;
      cur = nextBreak;
    }
  }

  // A second argument must be given to configure the parser process.
  // These options are recognized (only `ecmaVersion` is required):

  var defaultOptions = {
    // `ecmaVersion` indicates the ECMAScript version to parse. Must be
    // either 3, 5, 6 (or 2015), 7 (2016), 8 (2017), 9 (2018), 10
    // (2019), 11 (2020), 12 (2021), 13 (2022), 14 (2023), or `"latest"`
    // (the latest version the library supports). This influences
    // support for strict mode, the set of reserved words, and support
    // for new syntax features.
    ecmaVersion: null,
    // `sourceType` indicates the mode the code should be parsed in.
    // Can be either `"script"`, `"module"` or `"commonjs"`. This influences global
    // strict mode and parsing of `import` and `export` declarations.
    sourceType: "script",
    // `onInsertedSemicolon` can be a callback that will be called when
    // a semicolon is automatically inserted. It will be passed the
    // position of the inserted semicolon as an offset, and if
    // `locations` is enabled, it is given the location as a `{line,
    // column}` object as second argument.
    onInsertedSemicolon: null,
    // `onTrailingComma` is similar to `onInsertedSemicolon`, but for
    // trailing commas.
    onTrailingComma: null,
    // By default, reserved words are only enforced if ecmaVersion >= 5.
    // Set `allowReserved` to a boolean value to explicitly turn this on
    // an off. When this option has the value "never", reserved words
    // and keywords can also not be used as property names.
    allowReserved: null,
    // When enabled, a return at the top level is not considered an
    // error.
    allowReturnOutsideFunction: false,
    // When enabled, import/export statements are not constrained to
    // appearing at the top of the program, and an import.meta expression
    // in a script isn't considered an error.
    allowImportExportEverywhere: false,
    // By default, await identifiers are allowed to appear at the top-level scope only if ecmaVersion >= 2022.
    // When enabled, await identifiers are allowed to appear at the top-level scope,
    // but they are still not allowed in non-async functions.
    allowAwaitOutsideFunction: null,
    // When enabled, super identifiers are not constrained to
    // appearing in methods and do not raise an error when they appear elsewhere.
    allowSuperOutsideMethod: null,
    // When enabled, hashbang directive in the beginning of file is
    // allowed and treated as a line comment. Enabled by default when
    // `ecmaVersion` >= 2023.
    allowHashBang: false,
    // By default, the parser will verify that private properties are
    // only used in places where they are valid and have been declared.
    // Set this to false to turn such checks off.
    checkPrivateFields: true,
    // When `locations` is on, `loc` properties holding objects with
    // `start` and `end` properties in `{line, column}` form (with
    // line being 1-based and column 0-based) will be attached to the
    // nodes.
    locations: false,
    // A function can be passed as `onToken` option, which will
    // cause Acorn to call that function with object in the same
    // format as tokens returned from `tokenizer().getToken()`. Note
    // that you are not allowed to call the parser from the
    // callback—that will corrupt its internal state.
    onToken: null,
    // A function can be passed as `onComment` option, which will
    // cause Acorn to call that function with `(block, text, start,
    // end)` parameters whenever a comment is skipped. `block` is a
    // boolean indicating whether this is a block (`/* */`) comment,
    // `text` is the content of the comment, and `start` and `end` are
    // character offsets that denote the start and end of the comment.
    // When the `locations` option is on, two more parameters are
    // passed, the full `{line, column}` locations of the start and
    // end of the comments. Note that you are not allowed to call the
    // parser from the callback—that will corrupt its internal state.
    // When this option has an array as value, objects representing the
    // comments are pushed to it.
    onComment: null,
    // Nodes have their start and end characters offsets recorded in
    // `start` and `end` properties (directly on the node, rather than
    // the `loc` object, which holds line/column data. To also add a
    // [semi-standardized][range] `range` property holding a `[start,
    // end]` array with the same numbers, set the `ranges` option to
    // `true`.
    //
    // [range]: https://bugzilla.mozilla.org/show_bug.cgi?id=745678
    ranges: false,
    // It is possible to parse multiple files into a single AST by
    // passing the tree produced by parsing the first file as
    // `program` option in subsequent parses. This will add the
    // toplevel forms of the parsed file to the `Program` (top) node
    // of an existing parse tree.
    program: null,
    // When `locations` is on, you can pass this to record the source
    // file in every node's `loc` object.
    sourceFile: null,
    // This value, if given, is stored in every node, whether
    // `locations` is on or off.
    directSourceFile: null,
    // When enabled, parenthesized expressions are represented by
    // (non-standard) ParenthesizedExpression nodes
    preserveParens: false
  };

  // Interpret and default an options object

  var warnedAboutEcmaVersion = false;

  function getOptions(opts) {
    var options = {};

    for (var opt in defaultOptions)
      { options[opt] = opts && hasOwn(opts, opt) ? opts[opt] : defaultOptions[opt]; }

    if (options.ecmaVersion === "latest") {
      options.ecmaVersion = 1e8;
    } else if (options.ecmaVersion == null) {
      if (!warnedAboutEcmaVersion && typeof console === "object" && console.warn) {
        warnedAboutEcmaVersion = true;
        console.warn("Since Acorn 8.0.0, options.ecmaVersion is required.\nDefaulting to 2020, but this will stop working in the future.");
      }
      options.ecmaVersion = 11;
    } else if (options.ecmaVersion >= 2015) {
      options.ecmaVersion -= 2009;
    }

    if (options.allowReserved == null)
      { options.allowReserved = options.ecmaVersion < 5; }

    if (!opts || opts.allowHashBang == null)
      { options.allowHashBang = options.ecmaVersion >= 14; }

    if (isArray(options.onToken)) {
      var tokens = options.onToken;
      options.onToken = function (token) { return tokens.push(token); };
    }
    if (isArray(options.onComment))
      { options.onComment = pushComment(options, options.onComment); }

    if (options.sourceType === "commonjs" && options.allowAwaitOutsideFunction)
      { throw new Error("Cannot use allowAwaitOutsideFunction with sourceType: commonjs") }

    return options
  }

  function pushComment(options, array) {
    return function(block, text, start, end, startLoc, endLoc) {
      var comment = {
        type: block ? "Block" : "Line",
        value: text,
        start: start,
        end: end
      };
      if (options.locations)
        { comment.loc = new SourceLocation(this, startLoc, endLoc); }
      if (options.ranges)
        { comment.range = [start, end]; }
      array.push(comment);
    }
  }

  // Each scope gets a bitset that may contain these flags
  var
      SCOPE_TOP = 1,
      SCOPE_FUNCTION = 2,
      SCOPE_ASYNC = 4,
      SCOPE_GENERATOR = 8,
      SCOPE_ARROW = 16,
      SCOPE_SIMPLE_CATCH = 32,
      SCOPE_SUPER = 64,
      SCOPE_DIRECT_SUPER = 128,
      SCOPE_CLASS_STATIC_BLOCK = 256,
      SCOPE_CLASS_FIELD_INIT = 512,
      SCOPE_SWITCH = 1024,
      SCOPE_VAR = SCOPE_TOP | SCOPE_FUNCTION | SCOPE_CLASS_STATIC_BLOCK;

  function functionFlags(async, generator) {
    return SCOPE_FUNCTION | (async ? SCOPE_ASYNC : 0) | (generator ? SCOPE_GENERATOR : 0)
  }

  // Used in checkLVal* and declareName to determine the type of a binding
  var
      BIND_NONE = 0, // Not a binding
      BIND_VAR = 1, // Var-style binding
      BIND_LEXICAL = 2, // Let- or const-style binding
      BIND_FUNCTION = 3, // Function declaration
      BIND_SIMPLE_CATCH = 4, // Simple (identifier pattern) catch binding
      BIND_OUTSIDE = 5; // Special case for function names as bound inside the function

  var Parser = function Parser(options, input, startPos) {
    this.options = options = getOptions(options);
    this.sourceFile = options.sourceFile;
    this.keywords = wordsRegexp(keywords$1[options.ecmaVersion >= 6 ? 6 : options.sourceType === "module" ? "5module" : 5]);
    var reserved = "";
    if (options.allowReserved !== true) {
      reserved = reservedWords[options.ecmaVersion >= 6 ? 6 : options.ecmaVersion === 5 ? 5 : 3];
      if (options.sourceType === "module") { reserved += " await"; }
    }
    this.reservedWords = wordsRegexp(reserved);
    var reservedStrict = (reserved ? reserved + " " : "") + reservedWords.strict;
    this.reservedWordsStrict = wordsRegexp(reservedStrict);
    this.reservedWordsStrictBind = wordsRegexp(reservedStrict + " " + reservedWords.strictBind);
    this.input = String(input);

    // Used to signal to callers of `readWord1` whether the word
    // contained any escape sequences. This is needed because words with
    // escape sequences must not be interpreted as keywords.
    this.containsEsc = false;

    // Set up token state

    // The current position of the tokenizer in the input.
    if (startPos) {
      this.pos = startPos;
      this.lineStart = this.input.lastIndexOf("\n", startPos - 1) + 1;
      this.curLine = this.input.slice(0, this.lineStart).split(lineBreak).length;
    } else {
      this.pos = this.lineStart = 0;
      this.curLine = 1;
    }

    // Properties of the current token:
    // Its type
    this.type = types$1.eof;
    // For tokens that include more information than their type, the value
    this.value = null;
    // Its start and end offset
    this.start = this.end = this.pos;
    // And, if locations are used, the {line, column} object
    // corresponding to those offsets
    this.startLoc = this.endLoc = this.curPosition();

    // Position information for the previous token
    this.lastTokEndLoc = this.lastTokStartLoc = null;
    this.lastTokStart = this.lastTokEnd = this.pos;

    // The context stack is used to superficially track syntactic
    // context to predict whether a regular expression is allowed in a
    // given position.
    this.context = this.initialContext();
    this.exprAllowed = true;

    // Figure out if it's a module code.
    this.inModule = options.sourceType === "module";
    this.strict = this.inModule || this.strictDirective(this.pos);

    // Used to signify the start of a potential arrow function
    this.potentialArrowAt = -1;
    this.potentialArrowInForAwait = false;

    // Positions to delayed-check that yield/await does not exist in default parameters.
    this.yieldPos = this.awaitPos = this.awaitIdentPos = 0;
    // Labels in scope.
    this.labels = [];
    // Thus-far undefined exports.
    this.undefinedExports = Object.create(null);

    // If enabled, skip leading hashbang line.
    if (this.pos === 0 && options.allowHashBang && this.input.slice(0, 2) === "#!")
      { this.skipLineComment(2); }

    // Scope tracking for duplicate variable names (see scope.js)
    this.scopeStack = [];
    this.enterScope(
      this.options.sourceType === "commonjs"
        // In commonjs, the top-level scope behaves like a function scope
        ? SCOPE_FUNCTION
        : SCOPE_TOP
    );

    // For RegExp validation
    this.regexpState = null;

    // The stack of private names.
    // Each element has two properties: 'declared' and 'used'.
    // When it exited from the outermost class definition, all used private names must be declared.
    this.privateNameStack = [];
  };

  var prototypeAccessors = { inFunction: { configurable: true },inGenerator: { configurable: true },inAsync: { configurable: true },canAwait: { configurable: true },allowReturn: { configurable: true },allowSuper: { configurable: true },allowDirectSuper: { configurable: true },treatFunctionsAsVar: { configurable: true },allowNewDotTarget: { configurable: true },allowUsing: { configurable: true },inClassStaticBlock: { configurable: true } };

  Parser.prototype.parse = function parse () {
    var node = this.options.program || this.startNode();
    this.nextToken();
    return this.parseTopLevel(node)
  };

  prototypeAccessors.inFunction.get = function () { return (this.currentVarScope().flags & SCOPE_FUNCTION) > 0 };

  prototypeAccessors.inGenerator.get = function () { return (this.currentVarScope().flags & SCOPE_GENERATOR) > 0 };

  prototypeAccessors.inAsync.get = function () { return (this.currentVarScope().flags & SCOPE_ASYNC) > 0 };

  prototypeAccessors.canAwait.get = function () {
    for (var i = this.scopeStack.length - 1; i >= 0; i--) {
      var ref = this.scopeStack[i];
        var flags = ref.flags;
      if (flags & (SCOPE_CLASS_STATIC_BLOCK | SCOPE_CLASS_FIELD_INIT)) { return false }
      if (flags & SCOPE_FUNCTION) { return (flags & SCOPE_ASYNC) > 0 }
    }
    return (this.inModule && this.options.ecmaVersion >= 13) || this.options.allowAwaitOutsideFunction
  };

  prototypeAccessors.allowReturn.get = function () {
    if (this.inFunction) { return true }
    if (this.options.allowReturnOutsideFunction && this.currentVarScope().flags & SCOPE_TOP) { return true }
    return false
  };

  prototypeAccessors.allowSuper.get = function () {
    var ref = this.currentThisScope();
      var flags = ref.flags;
    return (flags & SCOPE_SUPER) > 0 || this.options.allowSuperOutsideMethod
  };

  prototypeAccessors.allowDirectSuper.get = function () { return (this.currentThisScope().flags & SCOPE_DIRECT_SUPER) > 0 };

  prototypeAccessors.treatFunctionsAsVar.get = function () { return this.treatFunctionsAsVarInScope(this.currentScope()) };

  prototypeAccessors.allowNewDotTarget.get = function () {
    for (var i = this.scopeStack.length - 1; i >= 0; i--) {
      var ref = this.scopeStack[i];
        var flags = ref.flags;
      if (flags & (SCOPE_CLASS_STATIC_BLOCK | SCOPE_CLASS_FIELD_INIT) ||
          ((flags & SCOPE_FUNCTION) && !(flags & SCOPE_ARROW))) { return true }
    }
    return false
  };

  prototypeAccessors.allowUsing.get = function () {
    var ref = this.currentScope();
      var flags = ref.flags;
    if (flags & SCOPE_SWITCH) { return false }
    if (!this.inModule && flags & SCOPE_TOP) { return false }
    return true
  };

  prototypeAccessors.inClassStaticBlock.get = function () {
    return (this.currentVarScope().flags & SCOPE_CLASS_STATIC_BLOCK) > 0
  };

  Parser.extend = function extend () {
      var plugins = [], len = arguments.length;
      while ( len-- ) plugins[ len ] = arguments[ len ];

    var cls = this;
    for (var i = 0; i < plugins.length; i++) { cls = plugins[i](cls); }
    return cls
  };

  Parser.parse = function parse (input, options) {
    return new this(options, input).parse()
  };

  Parser.parseExpressionAt = function parseExpressionAt (input, pos, options) {
    var parser = new this(options, input, pos);
    parser.nextToken();
    return parser.parseExpression()
  };

  Parser.tokenizer = function tokenizer (input, options) {
    return new this(options, input)
  };

  Object.defineProperties( Parser.prototype, prototypeAccessors );

  var pp$9 = Parser.prototype;

  // ## Parser utilities

  var literal = /^(?:'((?:\\[^]|[^'\\])*?)'|"((?:\\[^]|[^"\\])*?)")/;
  pp$9.strictDirective = function(start) {
    if (this.options.ecmaVersion < 5) { return false }
    for (;;) {
      // Try to find string literal.
      skipWhiteSpace.lastIndex = start;
      start += skipWhiteSpace.exec(this.input)[0].length;
      var match = literal.exec(this.input.slice(start));
      if (!match) { return false }
      if ((match[1] || match[2]) === "use strict") {
        skipWhiteSpace.lastIndex = start + match[0].length;
        var spaceAfter = skipWhiteSpace.exec(this.input), end = spaceAfter.index + spaceAfter[0].length;
        var next = this.input.charAt(end);
        return next === ";" || next === "}" ||
          (lineBreak.test(spaceAfter[0]) &&
           !(/[(`.[+\-/*%<>=,?^&]/.test(next) || next === "!" && this.input.charAt(end + 1) === "="))
      }
      start += match[0].length;

      // Skip semicolon, if any.
      skipWhiteSpace.lastIndex = start;
      start += skipWhiteSpace.exec(this.input)[0].length;
      if (this.input[start] === ";")
        { start++; }
    }
  };

  // Predicate that tests whether the next token is of the given
  // type, and if yes, consumes it as a side effect.

  pp$9.eat = function(type) {
    if (this.type === type) {
      this.next();
      return true
    } else {
      return false
    }
  };

  // Tests whether parsed token is a contextual keyword.

  pp$9.isContextual = function(name) {
    return this.type === types$1.name && this.value === name && !this.containsEsc
  };

  // Consumes contextual keyword if possible.

  pp$9.eatContextual = function(name) {
    if (!this.isContextual(name)) { return false }
    this.next();
    return true
  };

  // Asserts that following token is given contextual keyword.

  pp$9.expectContextual = function(name) {
    if (!this.eatContextual(name)) { this.unexpected(); }
  };

  // Test whether a semicolon can be inserted at the current position.

  pp$9.canInsertSemicolon = function() {
    return this.type === types$1.eof ||
      this.type === types$1.braceR ||
      lineBreak.test(this.input.slice(this.lastTokEnd, this.start))
  };

  pp$9.insertSemicolon = function() {
    if (this.canInsertSemicolon()) {
      if (this.options.onInsertedSemicolon)
        { this.options.onInsertedSemicolon(this.lastTokEnd, this.lastTokEndLoc); }
      return true
    }
  };

  // Consume a semicolon, or, failing that, see if we are allowed to
  // pretend that there is a semicolon at this position.

  pp$9.semicolon = function() {
    if (!this.eat(types$1.semi) && !this.insertSemicolon()) { this.unexpected(); }
  };

  pp$9.afterTrailingComma = function(tokType, notNext) {
    if (this.type === tokType) {
      if (this.options.onTrailingComma)
        { this.options.onTrailingComma(this.lastTokStart, this.lastTokStartLoc); }
      if (!notNext)
        { this.next(); }
      return true
    }
  };

  // Expect a token of a given type. If found, consume it, otherwise,
  // raise an unexpected token error.

  pp$9.expect = function(type) {
    this.eat(type) || this.unexpected();
  };

  // Raise an unexpected token error.

  pp$9.unexpected = function(pos) {
    this.raise(pos != null ? pos : this.start, "Unexpected token");
  };

  var DestructuringErrors = function DestructuringErrors() {
    this.shorthandAssign =
    this.trailingComma =
    this.parenthesizedAssign =
    this.parenthesizedBind =
    this.doubleProto =
      -1;
  };

  pp$9.checkPatternErrors = function(refDestructuringErrors, isAssign) {
    if (!refDestructuringErrors) { return }
    if (refDestructuringErrors.trailingComma > -1)
      { this.raiseRecoverable(refDestructuringErrors.trailingComma, "Comma is not permitted after the rest element"); }
    var parens = isAssign ? refDestructuringErrors.parenthesizedAssign : refDestructuringErrors.parenthesizedBind;
    if (parens > -1) { this.raiseRecoverable(parens, isAssign ? "Assigning to rvalue" : "Parenthesized pattern"); }
  };

  pp$9.checkExpressionErrors = function(refDestructuringErrors, andThrow) {
    if (!refDestructuringErrors) { return false }
    var shorthandAssign = refDestructuringErrors.shorthandAssign;
    var doubleProto = refDestructuringErrors.doubleProto;
    if (!andThrow) { return shorthandAssign >= 0 || doubleProto >= 0 }
    if (shorthandAssign >= 0)
      { this.raise(shorthandAssign, "Shorthand property assignments are valid only in destructuring patterns"); }
    if (doubleProto >= 0)
      { this.raiseRecoverable(doubleProto, "Redefinition of __proto__ property"); }
  };

  pp$9.checkYieldAwaitInDefaultParams = function() {
    if (this.yieldPos && (!this.awaitPos || this.yieldPos < this.awaitPos))
      { this.raise(this.yieldPos, "Yield expression cannot be a default value"); }
    if (this.awaitPos)
      { this.raise(this.awaitPos, "Await expression cannot be a default value"); }
  };

  pp$9.isSimpleAssignTarget = function(expr) {
    if (expr.type === "ParenthesizedExpression")
      { return this.isSimpleAssignTarget(expr.expression) }
    return expr.type === "Identifier" || expr.type === "MemberExpression"
  };

  var pp$8 = Parser.prototype;

  // ### Statement parsing

  // Parse a program. Initializes the parser, reads any number of
  // statements, and wraps them in a Program node.  Optionally takes a
  // `program` argument.  If present, the statements will be appended
  // to its body instead of creating a new node.

  pp$8.parseTopLevel = function(node) {
    var exports = Object.create(null);
    if (!node.body) { node.body = []; }
    while (this.type !== types$1.eof) {
      var stmt = this.parseStatement(null, true, exports);
      node.body.push(stmt);
    }
    if (this.inModule)
      { for (var i = 0, list = Object.keys(this.undefinedExports); i < list.length; i += 1)
        {
          var name = list[i];

          this.raiseRecoverable(this.undefinedExports[name].start, ("Export '" + name + "' is not defined"));
        } }
    this.adaptDirectivePrologue(node.body);
    this.next();
    node.sourceType = this.options.sourceType === "commonjs" ? "script" : this.options.sourceType;
    return this.finishNode(node, "Program")
  };

  var loopLabel = {kind: "loop"}, switchLabel = {kind: "switch"};

  pp$8.isLet = function(context) {
    if (this.options.ecmaVersion < 6 || !this.isContextual("let")) { return false }
    skipWhiteSpace.lastIndex = this.pos;
    var skip = skipWhiteSpace.exec(this.input);
    var next = this.pos + skip[0].length, nextCh = this.fullCharCodeAt(next);
    // For ambiguous cases, determine if a LexicalDeclaration (or only a
    // Statement) is allowed here. If context is not empty then only a Statement
    // is allowed. However, `let [` is an explicit negative lookahead for
    // ExpressionStatement, so special-case it first.
    if (nextCh === 91 || nextCh === 92) { return true } // '[', '\'
    if (context) { return false }

    if (nextCh === 123) { return true } // '{'
    if (isIdentifierStart(nextCh)) {
      var start = next;
      do { next += nextCh <= 0xffff ? 1 : 2; }
      while (isIdentifierChar(nextCh = this.fullCharCodeAt(next)))
      if (nextCh === 92) { return true }
      var ident = this.input.slice(start, next);
      if (!keywordRelationalOperator.test(ident)) { return true }
    }
    return false
  };

  // check 'async [no LineTerminator here] function'
  // - 'async /*foo*/ function' is OK.
  // - 'async /*\n*/ function' is invalid.
  pp$8.isAsyncFunction = function() {
    if (this.options.ecmaVersion < 8 || !this.isContextual("async"))
      { return false }

    skipWhiteSpace.lastIndex = this.pos;
    var skip = skipWhiteSpace.exec(this.input);
    var next = this.pos + skip[0].length, after;
    return !lineBreak.test(this.input.slice(this.pos, next)) &&
      this.input.slice(next, next + 8) === "function" &&
      (next + 8 === this.input.length ||
       !(isIdentifierChar(after = this.fullCharCodeAt(next + 8)) || after === 92 /* '\' */))
  };

  pp$8.isUsingKeyword = function(isAwaitUsing, isFor) {
    if (this.options.ecmaVersion < 17 || !this.isContextual(isAwaitUsing ? "await" : "using"))
      { return false }

    skipWhiteSpace.lastIndex = this.pos;
    var skip = skipWhiteSpace.exec(this.input);
    var next = this.pos + skip[0].length;

    if (lineBreak.test(this.input.slice(this.pos, next))) { return false }

    if (isAwaitUsing) {
      var usingEndPos = next + 5 /* using */, after;
      if (this.input.slice(next, usingEndPos) !== "using" ||
        usingEndPos === this.input.length ||
        isIdentifierChar(after = this.fullCharCodeAt(usingEndPos)) ||
        after === 92 /* '\' */
      ) { return false }

      skipWhiteSpace.lastIndex = usingEndPos;
      var skipAfterUsing = skipWhiteSpace.exec(this.input);
      next = usingEndPos + skipAfterUsing[0].length;
      if (skipAfterUsing && lineBreak.test(this.input.slice(usingEndPos, next))) { return false }
    }

    var ch = this.fullCharCodeAt(next);
    if (!isIdentifierStart(ch) && ch !== 92 /* '\' */) { return false }
    var idStart = next;
    do { next += ch <= 0xffff ? 1 : 2; }
    while (isIdentifierChar(ch = this.fullCharCodeAt(next)))
    if (ch === 92) { return true }
    var id = this.input.slice(idStart, next);
    if (keywordRelationalOperator.test(id) || isFor && id === "of") { return false }
    return true
  };

  pp$8.isAwaitUsing = function(isFor) {
    return this.isUsingKeyword(true, isFor)
  };

  pp$8.isUsing = function(isFor) {
    return this.isUsingKeyword(false, isFor)
  };

  // Parse a single statement.
  //
  // If expecting a statement and finding a slash operator, parse a
  // regular expression literal. This is to handle cases like
  // `if (foo) /blah/.exec(foo)`, where looking at the previous token
  // does not help.

  pp$8.parseStatement = function(context, topLevel, exports) {
    var starttype = this.type, node = this.startNode(), kind;

    if (this.isLet(context)) {
      starttype = types$1._var;
      kind = "let";
    }

    // Most types of statements are recognized by the keyword they
    // start with. Many are trivial to parse, some require a bit of
    // complexity.

    switch (starttype) {
    case types$1._break: case types$1._continue: return this.parseBreakContinueStatement(node, starttype.keyword)
    case types$1._debugger: return this.parseDebuggerStatement(node)
    case types$1._do: return this.parseDoStatement(node)
    case types$1._for: return this.parseForStatement(node)
    case types$1._function:
      // Function as sole body of either an if statement or a labeled statement
      // works, but not when it is part of a labeled statement that is the sole
      // body of an if statement.
      if ((context && (this.strict || context !== "if" && context !== "label")) && this.options.ecmaVersion >= 6) { this.unexpected(); }
      return this.parseFunctionStatement(node, false, !context)
    case types$1._class:
      if (context) { this.unexpected(); }
      return this.parseClass(node, true)
    case types$1._if: return this.parseIfStatement(node)
    case types$1._return: return this.parseReturnStatement(node)
    case types$1._switch: return this.parseSwitchStatement(node)
    case types$1._throw: return this.parseThrowStatement(node)
    case types$1._try: return this.parseTryStatement(node)
    case types$1._const: case types$1._var:
      kind = kind || this.value;
      if (context && kind !== "var") { this.unexpected(); }
      return this.parseVarStatement(node, kind)
    case types$1._while: return this.parseWhileStatement(node)
    case types$1._with: return this.parseWithStatement(node)
    case types$1.braceL: return this.parseBlock(true, node)
    case types$1.semi: return this.parseEmptyStatement(node)
    case types$1._export:
    case types$1._import:
      if (this.options.ecmaVersion > 10 && starttype === types$1._import) {
        skipWhiteSpace.lastIndex = this.pos;
        var skip = skipWhiteSpace.exec(this.input);
        var next = this.pos + skip[0].length, nextCh = this.input.charCodeAt(next);
        if (nextCh === 40 || nextCh === 46) // '(' or '.'
          { return this.parseExpressionStatement(node, this.parseExpression()) }
      }

      if (!this.options.allowImportExportEverywhere) {
        if (!topLevel)
          { this.raise(this.start, "'import' and 'export' may only appear at the top level"); }
        if (!this.inModule)
          { this.raise(this.start, "'import' and 'export' may appear only with 'sourceType: module'"); }
      }
      return starttype === types$1._import ? this.parseImport(node) : this.parseExport(node, exports)

      // If the statement does not start with a statement keyword or a
      // brace, it's an ExpressionStatement or LabeledStatement. We
      // simply start parsing an expression, and afterwards, if the
      // next token is a colon and the expression was a simple
      // Identifier node, we switch to interpreting it as a label.
    default:
      if (this.isAsyncFunction()) {
        if (context) { this.unexpected(); }
        this.next();
        return this.parseFunctionStatement(node, true, !context)
      }

      var usingKind = this.isAwaitUsing(false) ? "await using" : this.isUsing(false) ? "using" : null;
      if (usingKind) {
        if (!this.allowUsing) {
          this.raise(this.start, "Using declaration cannot appear in the top level when source type is `script` or in the bare case statement");
        }
        if (usingKind === "await using") {
          if (!this.canAwait) {
            this.raise(this.start, "Await using cannot appear outside of async function");
          }
          this.next();
        }
        this.next();
        this.parseVar(node, false, usingKind);
        this.semicolon();
        return this.finishNode(node, "VariableDeclaration")
      }

      var maybeName = this.value, expr = this.parseExpression();
      if (starttype === types$1.name && expr.type === "Identifier" && this.eat(types$1.colon))
        { return this.parseLabeledStatement(node, maybeName, expr, context) }
      else { return this.parseExpressionStatement(node, expr) }
    }
  };

  pp$8.parseBreakContinueStatement = function(node, keyword) {
    var isBreak = keyword === "break";
    this.next();
    if (this.eat(types$1.semi) || this.insertSemicolon()) { node.label = null; }
    else if (this.type !== types$1.name) { this.unexpected(); }
    else {
      node.label = this.parseIdent();
      this.semicolon();
    }

    // Verify that there is an actual destination to break or
    // continue to.
    var i = 0;
    for (; i < this.labels.length; ++i) {
      var lab = this.labels[i];
      if (node.label == null || lab.name === node.label.name) {
        if (lab.kind != null && (isBreak || lab.kind === "loop")) { break }
        if (node.label && isBreak) { break }
      }
    }
    if (i === this.labels.length) { this.raise(node.start, "Unsyntactic " + keyword); }
    return this.finishNode(node, isBreak ? "BreakStatement" : "ContinueStatement")
  };

  pp$8.parseDebuggerStatement = function(node) {
    this.next();
    this.semicolon();
    return this.finishNode(node, "DebuggerStatement")
  };

  pp$8.parseDoStatement = function(node) {
    this.next();
    this.labels.push(loopLabel);
    node.body = this.parseStatement("do");
    this.labels.pop();
    this.expect(types$1._while);
    node.test = this.parseParenExpression();
    if (this.options.ecmaVersion >= 6)
      { this.eat(types$1.semi); }
    else
      { this.semicolon(); }
    return this.finishNode(node, "DoWhileStatement")
  };

  // Disambiguating between a `for` and a `for`/`in` or `for`/`of`
  // loop is non-trivial. Basically, we have to parse the init `var`
  // statement or expression, disallowing the `in` operator (see
  // the second parameter to `parseExpression`), and then check
  // whether the next token is `in` or `of`. When there is no init
  // part (semicolon immediately after the opening parenthesis), it
  // is a regular `for` loop.

  pp$8.parseForStatement = function(node) {
    this.next();
    var awaitAt = (this.options.ecmaVersion >= 9 && this.canAwait && this.eatContextual("await")) ? this.lastTokStart : -1;
    this.labels.push(loopLabel);
    this.enterScope(0);
    this.expect(types$1.parenL);
    if (this.type === types$1.semi) {
      if (awaitAt > -1) { this.unexpected(awaitAt); }
      return this.parseFor(node, null)
    }
    var isLet = this.isLet();
    if (this.type === types$1._var || this.type === types$1._const || isLet) {
      var init$1 = this.startNode(), kind = isLet ? "let" : this.value;
      this.next();
      this.parseVar(init$1, true, kind);
      this.finishNode(init$1, "VariableDeclaration");
      return this.parseForAfterInit(node, init$1, awaitAt)
    }
    var startsWithLet = this.isContextual("let"), isForOf = false;

    var usingKind = this.isUsing(true) ? "using" : this.isAwaitUsing(true) ? "await using" : null;
    if (usingKind) {
      var init$2 = this.startNode();
      this.next();
      if (usingKind === "await using") {
        if (!this.canAwait) {
          this.raise(this.start, "Await using cannot appear outside of async function");
        }
        this.next();
      }
      this.parseVar(init$2, true, usingKind);
      this.finishNode(init$2, "VariableDeclaration");
      return this.parseForAfterInit(node, init$2, awaitAt)
    }
    var containsEsc = this.containsEsc;
    var refDestructuringErrors = new DestructuringErrors;
    var initPos = this.start;
    var init = awaitAt > -1
      ? this.parseExprSubscripts(refDestructuringErrors, "await")
      : this.parseExpression(true, refDestructuringErrors);
    if (this.type === types$1._in || (isForOf = this.options.ecmaVersion >= 6 && this.isContextual("of"))) {
      if (awaitAt > -1) { // implies `ecmaVersion >= 9` (see declaration of awaitAt)
        if (this.type === types$1._in) { this.unexpected(awaitAt); }
        node.await = true;
      } else if (isForOf && this.options.ecmaVersion >= 8) {
        if (init.start === initPos && !containsEsc && init.type === "Identifier" && init.name === "async") { this.unexpected(); }
        else if (this.options.ecmaVersion >= 9) { node.await = false; }
      }
      if (startsWithLet && isForOf) { this.raise(init.start, "The left-hand side of a for-of loop may not start with 'let'."); }
      this.toAssignable(init, false, refDestructuringErrors);
      this.checkLValPattern(init);
      return this.parseForIn(node, init)
    } else {
      this.checkExpressionErrors(refDestructuringErrors, true);
    }
    if (awaitAt > -1) { this.unexpected(awaitAt); }
    return this.parseFor(node, init)
  };

  // Helper method to parse for loop after variable initialization
  pp$8.parseForAfterInit = function(node, init, awaitAt) {
    if ((this.type === types$1._in || (this.options.ecmaVersion >= 6 && this.isContextual("of"))) && init.declarations.length === 1) {
      if (this.options.ecmaVersion >= 9) {
        if (this.type === types$1._in) {
          if (awaitAt > -1) { this.unexpected(awaitAt); }
        } else { node.await = awaitAt > -1; }
      }
      return this.parseForIn(node, init)
    }
    if (awaitAt > -1) { this.unexpected(awaitAt); }
    return this.parseFor(node, init)
  };

  pp$8.parseFunctionStatement = function(node, isAsync, declarationPosition) {
    this.next();
    return this.parseFunction(node, FUNC_STATEMENT | (declarationPosition ? 0 : FUNC_HANGING_STATEMENT), false, isAsync)
  };

  pp$8.parseIfStatement = function(node) {
    this.next();
    node.test = this.parseParenExpression();
    // allow function declarations in branches, but only in non-strict mode
    node.consequent = this.parseStatement("if");
    node.alternate = this.eat(types$1._else) ? this.parseStatement("if") : null;
    return this.finishNode(node, "IfStatement")
  };

  pp$8.parseReturnStatement = function(node) {
    if (!this.allowReturn)
      { this.raise(this.start, "'return' outside of function"); }
    this.next();

    // In `return` (and `break`/`continue`), the keywords with
    // optional arguments, we eagerly look for a semicolon or the
    // possibility to insert one.

    if (this.eat(types$1.semi) || this.insertSemicolon()) { node.argument = null; }
    else { node.argument = this.parseExpression(); this.semicolon(); }
    return this.finishNode(node, "ReturnStatement")
  };

  pp$8.parseSwitchStatement = function(node) {
    this.next();
    node.discriminant = this.parseParenExpression();
    node.cases = [];
    this.expect(types$1.braceL);
    this.labels.push(switchLabel);
    this.enterScope(SCOPE_SWITCH);

    // Statements under must be grouped (by label) in SwitchCase
    // nodes. `cur` is used to keep the node that we are currently
    // adding statements to.

    var cur;
    for (var sawDefault = false; this.type !== types$1.braceR;) {
      if (this.type === types$1._case || this.type === types$1._default) {
        var isCase = this.type === types$1._case;
        if (cur) { this.finishNode(cur, "SwitchCase"); }
        node.cases.push(cur = this.startNode());
        cur.consequent = [];
        this.next();
        if (isCase) {
          cur.test = this.parseExpression();
        } else {
          if (sawDefault) { this.raiseRecoverable(this.lastTokStart, "Multiple default clauses"); }
          sawDefault = true;
          cur.test = null;
        }
        this.expect(types$1.colon);
      } else {
        if (!cur) { this.unexpected(); }
        cur.consequent.push(this.parseStatement(null));
      }
    }
    this.exitScope();
    if (cur) { this.finishNode(cur, "SwitchCase"); }
    this.next(); // Closing brace
    this.labels.pop();
    return this.finishNode(node, "SwitchStatement")
  };

  pp$8.parseThrowStatement = function(node) {
    this.next();
    if (lineBreak.test(this.input.slice(this.lastTokEnd, this.start)))
      { this.raise(this.lastTokEnd, "Illegal newline after throw"); }
    node.argument = this.parseExpression();
    this.semicolon();
    return this.finishNode(node, "ThrowStatement")
  };

  // Reused empty array added for node fields that are always empty.

  var empty$1 = [];

  pp$8.parseCatchClauseParam = function() {
    var param = this.parseBindingAtom();
    var simple = param.type === "Identifier";
    this.enterScope(simple ? SCOPE_SIMPLE_CATCH : 0);
    this.checkLValPattern(param, simple ? BIND_SIMPLE_CATCH : BIND_LEXICAL);
    this.expect(types$1.parenR);

    return param
  };

  pp$8.parseTryStatement = function(node) {
    this.next();
    node.block = this.parseBlock();
    node.handler = null;
    if (this.type === types$1._catch) {
      var clause = this.startNode();
      this.next();
      if (this.eat(types$1.parenL)) {
        clause.param = this.parseCatchClauseParam();
      } else {
        if (this.options.ecmaVersion < 10) { this.unexpected(); }
        clause.param = null;
        this.enterScope(0);
      }
      clause.body = this.parseBlock(false);
      this.exitScope();
      node.handler = this.finishNode(clause, "CatchClause");
    }
    node.finalizer = this.eat(types$1._finally) ? this.parseBlock() : null;
    if (!node.handler && !node.finalizer)
      { this.raise(node.start, "Missing catch or finally clause"); }
    return this.finishNode(node, "TryStatement")
  };

  pp$8.parseVarStatement = function(node, kind, allowMissingInitializer) {
    this.next();
    this.parseVar(node, false, kind, allowMissingInitializer);
    this.semicolon();
    return this.finishNode(node, "VariableDeclaration")
  };

  pp$8.parseWhileStatement = function(node) {
    this.next();
    node.test = this.parseParenExpression();
    this.labels.push(loopLabel);
    node.body = this.parseStatement("while");
    this.labels.pop();
    return this.finishNode(node, "WhileStatement")
  };

  pp$8.parseWithStatement = function(node) {
    if (this.strict) { this.raise(this.start, "'with' in strict mode"); }
    this.next();
    node.object = this.parseParenExpression();
    node.body = this.parseStatement("with");
    return this.finishNode(node, "WithStatement")
  };

  pp$8.parseEmptyStatement = function(node) {
    this.next();
    return this.finishNode(node, "EmptyStatement")
  };

  pp$8.parseLabeledStatement = function(node, maybeName, expr, context) {
    for (var i$1 = 0, list = this.labels; i$1 < list.length; i$1 += 1)
      {
      var label = list[i$1];

      if (label.name === maybeName)
        { this.raise(expr.start, "Label '" + maybeName + "' is already declared");
    } }
    var kind = this.type.isLoop ? "loop" : this.type === types$1._switch ? "switch" : null;
    for (var i = this.labels.length - 1; i >= 0; i--) {
      var label$1 = this.labels[i];
      if (label$1.statementStart === node.start) {
        // Update information about previous labels on this node
        label$1.statementStart = this.start;
        label$1.kind = kind;
      } else { break }
    }
    this.labels.push({name: maybeName, kind: kind, statementStart: this.start});
    node.body = this.parseStatement(context ? context.indexOf("label") === -1 ? context + "label" : context : "label");
    this.labels.pop();
    node.label = expr;
    return this.finishNode(node, "LabeledStatement")
  };

  pp$8.parseExpressionStatement = function(node, expr) {
    node.expression = expr;
    this.semicolon();
    return this.finishNode(node, "ExpressionStatement")
  };

  // Parse a semicolon-enclosed block of statements, handling `"use
  // strict"` declarations when `allowStrict` is true (used for
  // function bodies).

  pp$8.parseBlock = function(createNewLexicalScope, node, exitStrict) {
    if ( createNewLexicalScope === void 0 ) createNewLexicalScope = true;
    if ( node === void 0 ) node = this.startNode();

    node.body = [];
    this.expect(types$1.braceL);
    if (createNewLexicalScope) { this.enterScope(0); }
    while (this.type !== types$1.braceR) {
      var stmt = this.parseStatement(null);
      node.body.push(stmt);
    }
    if (exitStrict) { this.strict = false; }
    this.next();
    if (createNewLexicalScope) { this.exitScope(); }
    return this.finishNode(node, "BlockStatement")
  };

  // Parse a regular `for` loop. The disambiguation code in
  // `parseStatement` will already have parsed the init statement or
  // expression.

  pp$8.parseFor = function(node, init) {
    node.init = init;
    this.expect(types$1.semi);
    node.test = this.type === types$1.semi ? null : this.parseExpression();
    this.expect(types$1.semi);
    node.update = this.type === types$1.parenR ? null : this.parseExpression();
    this.expect(types$1.parenR);
    node.body = this.parseStatement("for");
    this.exitScope();
    this.labels.pop();
    return this.finishNode(node, "ForStatement")
  };

  // Parse a `for`/`in` and `for`/`of` loop, which are almost
  // same from parser's perspective.

  pp$8.parseForIn = function(node, init) {
    var isForIn = this.type === types$1._in;
    this.next();

    if (
      init.type === "VariableDeclaration" &&
      init.declarations[0].init != null &&
      (
        !isForIn ||
        this.options.ecmaVersion < 8 ||
        this.strict ||
        init.kind !== "var" ||
        init.declarations[0].id.type !== "Identifier"
      )
    ) {
      this.raise(
        init.start,
        ((isForIn ? "for-in" : "for-of") + " loop variable declaration may not have an initializer")
      );
    }
    node.left = init;
    node.right = isForIn ? this.parseExpression() : this.parseMaybeAssign();
    this.expect(types$1.parenR);
    node.body = this.parseStatement("for");
    this.exitScope();
    this.labels.pop();
    return this.finishNode(node, isForIn ? "ForInStatement" : "ForOfStatement")
  };

  // Parse a list of variable declarations.

  pp$8.parseVar = function(node, isFor, kind, allowMissingInitializer) {
    node.declarations = [];
    node.kind = kind;
    for (;;) {
      var decl = this.startNode();
      this.parseVarId(decl, kind);
      if (this.eat(types$1.eq)) {
        decl.init = this.parseMaybeAssign(isFor);
      } else if (!allowMissingInitializer && kind === "const" && !(this.type === types$1._in || (this.options.ecmaVersion >= 6 && this.isContextual("of")))) {
        this.unexpected();
      } else if (!allowMissingInitializer && (kind === "using" || kind === "await using") && this.options.ecmaVersion >= 17 && this.type !== types$1._in && !this.isContextual("of")) {
        this.raise(this.lastTokEnd, ("Missing initializer in " + kind + " declaration"));
      } else if (!allowMissingInitializer && decl.id.type !== "Identifier" && !(isFor && (this.type === types$1._in || this.isContextual("of")))) {
        this.raise(this.lastTokEnd, "Complex binding patterns require an initialization value");
      } else {
        decl.init = null;
      }
      node.declarations.push(this.finishNode(decl, "VariableDeclarator"));
      if (!this.eat(types$1.comma)) { break }
    }
    return node
  };

  pp$8.parseVarId = function(decl, kind) {
    decl.id = kind === "using" || kind === "await using"
      ? this.parseIdent()
      : this.parseBindingAtom();

    this.checkLValPattern(decl.id, kind === "var" ? BIND_VAR : BIND_LEXICAL, false);
  };

  var FUNC_STATEMENT = 1, FUNC_HANGING_STATEMENT = 2, FUNC_NULLABLE_ID = 4;

  // Parse a function declaration or literal (depending on the
  // `statement & FUNC_STATEMENT`).

  // Remove `allowExpressionBody` for 7.0.0, as it is only called with false
  pp$8.parseFunction = function(node, statement, allowExpressionBody, isAsync, forInit) {
    this.initFunction(node);
    if (this.options.ecmaVersion >= 9 || this.options.ecmaVersion >= 6 && !isAsync) {
      if (this.type === types$1.star && (statement & FUNC_HANGING_STATEMENT))
        { this.unexpected(); }
      node.generator = this.eat(types$1.star);
    }
    if (this.options.ecmaVersion >= 8)
      { node.async = !!isAsync; }

    if (statement & FUNC_STATEMENT) {
      node.id = (statement & FUNC_NULLABLE_ID) && this.type !== types$1.name ? null : this.parseIdent();
      if (node.id && !(statement & FUNC_HANGING_STATEMENT))
        // If it is a regular function declaration in sloppy mode, then it is
        // subject to Annex B semantics (BIND_FUNCTION). Otherwise, the binding
        // mode depends on properties of the current scope (see
        // treatFunctionsAsVar).
        { this.checkLValSimple(node.id, (this.strict || node.generator || node.async) ? this.treatFunctionsAsVar ? BIND_VAR : BIND_LEXICAL : BIND_FUNCTION); }
    }

    var oldYieldPos = this.yieldPos, oldAwaitPos = this.awaitPos, oldAwaitIdentPos = this.awaitIdentPos;
    this.yieldPos = 0;
    this.awaitPos = 0;
    this.awaitIdentPos = 0;
    this.enterScope(functionFlags(node.async, node.generator));

    if (!(statement & FUNC_STATEMENT))
      { node.id = this.type === types$1.name ? this.parseIdent() : null; }

    this.parseFunctionParams(node);
    this.parseFunctionBody(node, allowExpressionBody, false, forInit);

    this.yieldPos = oldYieldPos;
    this.awaitPos = oldAwaitPos;
    this.awaitIdentPos = oldAwaitIdentPos;
    return this.finishNode(node, (statement & FUNC_STATEMENT) ? "FunctionDeclaration" : "FunctionExpression")
  };

  pp$8.parseFunctionParams = function(node) {
    this.expect(types$1.parenL);
    node.params = this.parseBindingList(types$1.parenR, false, this.options.ecmaVersion >= 8);
    this.checkYieldAwaitInDefaultParams();
  };

  // Parse a class declaration or literal (depending on the
  // `isStatement` parameter).

  pp$8.parseClass = function(node, isStatement) {
    this.next();

    // ecma-262 14.6 Class Definitions
    // A class definition is always strict mode code.
    var oldStrict = this.strict;
    this.strict = true;

    this.parseClassId(node, isStatement);
    this.parseClassSuper(node);
    var privateNameMap = this.enterClassBody();
    var classBody = this.startNode();
    var hadConstructor = false;
    classBody.body = [];
    this.expect(types$1.braceL);
    while (this.type !== types$1.braceR) {
      var element = this.parseClassElement(node.superClass !== null);
      if (element) {
        classBody.body.push(element);
        if (element.type === "MethodDefinition" && element.kind === "constructor") {
          if (hadConstructor) { this.raiseRecoverable(element.start, "Duplicate constructor in the same class"); }
          hadConstructor = true;
        } else if (element.key && element.key.type === "PrivateIdentifier" && isPrivateNameConflicted(privateNameMap, element)) {
          this.raiseRecoverable(element.key.start, ("Identifier '#" + (element.key.name) + "' has already been declared"));
        }
      }
    }
    this.strict = oldStrict;
    this.next();
    node.body = this.finishNode(classBody, "ClassBody");
    this.exitClassBody();
    return this.finishNode(node, isStatement ? "ClassDeclaration" : "ClassExpression")
  };

  pp$8.parseClassElement = function(constructorAllowsSuper) {
    if (this.eat(types$1.semi)) { return null }

    var ecmaVersion = this.options.ecmaVersion;
    var node = this.startNode();
    var keyName = "";
    var isGenerator = false;
    var isAsync = false;
    var kind = "method";
    var isStatic = false;

    if (this.eatContextual("static")) {
      // Parse static init block
      if (ecmaVersion >= 13 && this.eat(types$1.braceL)) {
        this.parseClassStaticBlock(node);
        return node
      }
      if (this.isClassElementNameStart() || this.type === types$1.star) {
        isStatic = true;
      } else {
        keyName = "static";
      }
    }
    node.static = isStatic;
    if (!keyName && ecmaVersion >= 8 && this.eatContextual("async")) {
      if ((this.isClassElementNameStart() || this.type === types$1.star) && !this.canInsertSemicolon()) {
        isAsync = true;
      } else {
        keyName = "async";
      }
    }
    if (!keyName && (ecmaVersion >= 9 || !isAsync) && this.eat(types$1.star)) {
      isGenerator = true;
    }
    if (!keyName && !isAsync && !isGenerator) {
      var lastValue = this.value;
      if (this.eatContextual("get") || this.eatContextual("set")) {
        if (this.isClassElementNameStart()) {
          kind = lastValue;
        } else {
          keyName = lastValue;
        }
      }
    }

    // Parse element name
    if (keyName) {
      // 'async', 'get', 'set', or 'static' were not a keyword contextually.
      // The last token is any of those. Make it the element name.
      node.computed = false;
      node.key = this.startNodeAt(this.lastTokStart, this.lastTokStartLoc);
      node.key.name = keyName;
      this.finishNode(node.key, "Identifier");
    } else {
      this.parseClassElementName(node);
    }

    // Parse element value
    if (ecmaVersion < 13 || this.type === types$1.parenL || kind !== "method" || isGenerator || isAsync) {
      var isConstructor = !node.static && checkKeyName(node, "constructor");
      var allowsDirectSuper = isConstructor && constructorAllowsSuper;
      // Couldn't move this check into the 'parseClassMethod' method for backward compatibility.
      if (isConstructor && kind !== "method") { this.raise(node.key.start, "Constructor can't have get/set modifier"); }
      node.kind = isConstructor ? "constructor" : kind;
      this.parseClassMethod(node, isGenerator, isAsync, allowsDirectSuper);
    } else {
      this.parseClassField(node);
    }

    return node
  };

  pp$8.isClassElementNameStart = function() {
    return (
      this.type === types$1.name ||
      this.type === types$1.privateId ||
      this.type === types$1.num ||
      this.type === types$1.string ||
      this.type === types$1.bracketL ||
      this.type.keyword
    )
  };

  pp$8.parseClassElementName = function(element) {
    if (this.type === types$1.privateId) {
      if (this.value === "constructor") {
        this.raise(this.start, "Classes can't have an element named '#constructor'");
      }
      element.computed = false;
      element.key = this.parsePrivateIdent();
    } else {
      this.parsePropertyName(element);
    }
  };

  pp$8.parseClassMethod = function(method, isGenerator, isAsync, allowsDirectSuper) {
    // Check key and flags
    var key = method.key;
    if (method.kind === "constructor") {
      if (isGenerator) { this.raise(key.start, "Constructor can't be a generator"); }
      if (isAsync) { this.raise(key.start, "Constructor can't be an async method"); }
    } else if (method.static && checkKeyName(method, "prototype")) {
      this.raise(key.start, "Classes may not have a static property named prototype");
    }

    // Parse value
    var value = method.value = this.parseMethod(isGenerator, isAsync, allowsDirectSuper);

    // Check value
    if (method.kind === "get" && value.params.length !== 0)
      { this.raiseRecoverable(value.start, "getter should have no params"); }
    if (method.kind === "set" && value.params.length !== 1)
      { this.raiseRecoverable(value.start, "setter should have exactly one param"); }
    if (method.kind === "set" && value.params[0].type === "RestElement")
      { this.raiseRecoverable(value.params[0].start, "Setter cannot use rest params"); }

    return this.finishNode(method, "MethodDefinition")
  };

  pp$8.parseClassField = function(field) {
    if (checkKeyName(field, "constructor")) {
      this.raise(field.key.start, "Classes can't have a field named 'constructor'");
    } else if (field.static && checkKeyName(field, "prototype")) {
      this.raise(field.key.start, "Classes can't have a static field named 'prototype'");
    }

    if (this.eat(types$1.eq)) {
      // To raise SyntaxError if 'arguments' exists in the initializer.
      this.enterScope(SCOPE_CLASS_FIELD_INIT | SCOPE_SUPER);
      field.value = this.parseMaybeAssign();
      this.exitScope();
    } else {
      field.value = null;
    }
    this.semicolon();

    return this.finishNode(field, "PropertyDefinition")
  };

  pp$8.parseClassStaticBlock = function(node) {
    node.body = [];

    var oldLabels = this.labels;
    this.labels = [];
    this.enterScope(SCOPE_CLASS_STATIC_BLOCK | SCOPE_SUPER);
    while (this.type !== types$1.braceR) {
      var stmt = this.parseStatement(null);
      node.body.push(stmt);
    }
    this.next();
    this.exitScope();
    this.labels = oldLabels;

    return this.finishNode(node, "StaticBlock")
  };

  pp$8.parseClassId = function(node, isStatement) {
    if (this.type === types$1.name) {
      node.id = this.parseIdent();
      if (isStatement)
        { this.checkLValSimple(node.id, BIND_LEXICAL, false); }
    } else {
      if (isStatement === true)
        { this.unexpected(); }
      node.id = null;
    }
  };

  pp$8.parseClassSuper = function(node) {
    node.superClass = this.eat(types$1._extends) ? this.parseExprSubscripts(null, false) : null;
  };

  pp$8.enterClassBody = function() {
    var element = {declared: Object.create(null), used: []};
    this.privateNameStack.push(element);
    return element.declared
  };

  pp$8.exitClassBody = function() {
    var ref = this.privateNameStack.pop();
    var declared = ref.declared;
    var used = ref.used;
    if (!this.options.checkPrivateFields) { return }
    var len = this.privateNameStack.length;
    var parent = len === 0 ? null : this.privateNameStack[len - 1];
    for (var i = 0; i < used.length; ++i) {
      var id = used[i];
      if (!hasOwn(declared, id.name)) {
        if (parent) {
          parent.used.push(id);
        } else {
          this.raiseRecoverable(id.start, ("Private field '#" + (id.name) + "' must be declared in an enclosing class"));
        }
      }
    }
  };

  function isPrivateNameConflicted(privateNameMap, element) {
    var name = element.key.name;
    var curr = privateNameMap[name];

    var next = "true";
    if (element.type === "MethodDefinition" && (element.kind === "get" || element.kind === "set")) {
      next = (element.static ? "s" : "i") + element.kind;
    }

    // `class { get #a(){}; static set #a(_){} }` is also conflict.
    if (
      curr === "iget" && next === "iset" ||
      curr === "iset" && next === "iget" ||
      curr === "sget" && next === "sset" ||
      curr === "sset" && next === "sget"
    ) {
      privateNameMap[name] = "true";
      return false
    } else if (!curr) {
      privateNameMap[name] = next;
      return false
    } else {
      return true
    }
  }

  function checkKeyName(node, name) {
    var computed = node.computed;
    var key = node.key;
    return !computed && (
      key.type === "Identifier" && key.name === name ||
      key.type === "Literal" && key.value === name
    )
  }

  // Parses module export declaration.

  pp$8.parseExportAllDeclaration = function(node, exports) {
    if (this.options.ecmaVersion >= 11) {
      if (this.eatContextual("as")) {
        node.exported = this.parseModuleExportName();
        this.checkExport(exports, node.exported, this.lastTokStart);
      } else {
        node.exported = null;
      }
    }
    this.expectContextual("from");
    if (this.type !== types$1.string) { this.unexpected(); }
    node.source = this.parseExprAtom();
    if (this.options.ecmaVersion >= 16)
      { node.attributes = this.parseWithClause(); }
    this.semicolon();
    return this.finishNode(node, "ExportAllDeclaration")
  };

  pp$8.parseExport = function(node, exports) {
    this.next();
    // export * from '...'
    if (this.eat(types$1.star)) {
      return this.parseExportAllDeclaration(node, exports)
    }
    if (this.eat(types$1._default)) { // export default ...
      this.checkExport(exports, "default", this.lastTokStart);
      node.declaration = this.parseExportDefaultDeclaration();
      return this.finishNode(node, "ExportDefaultDeclaration")
    }
    // export var|const|let|function|class ...
    if (this.shouldParseExportStatement()) {
      node.declaration = this.parseExportDeclaration(node);
      if (node.declaration.type === "VariableDeclaration")
        { this.checkVariableExport(exports, node.declaration.declarations); }
      else
        { this.checkExport(exports, node.declaration.id, node.declaration.id.start); }
      node.specifiers = [];
      node.source = null;
      if (this.options.ecmaVersion >= 16)
        { node.attributes = []; }
    } else { // export { x, y as z } [from '...']
      node.declaration = null;
      node.specifiers = this.parseExportSpecifiers(exports);
      if (this.eatContextual("from")) {
        if (this.type !== types$1.string) { this.unexpected(); }
        node.source = this.parseExprAtom();
        if (this.options.ecmaVersion >= 16)
          { node.attributes = this.parseWithClause(); }
      } else {
        for (var i = 0, list = node.specifiers; i < list.length; i += 1) {
          // check for keywords used as local names
          var spec = list[i];

          this.checkUnreserved(spec.local);
          // check if export is defined
          this.checkLocalExport(spec.local);

          if (spec.local.type === "Literal") {
            this.raise(spec.local.start, "A string literal cannot be used as an exported binding without `from`.");
          }
        }

        node.source = null;
        if (this.options.ecmaVersion >= 16)
          { node.attributes = []; }
      }
      this.semicolon();
    }
    return this.finishNode(node, "ExportNamedDeclaration")
  };

  pp$8.parseExportDeclaration = function(node) {
    return this.parseStatement(null)
  };

  pp$8.parseExportDefaultDeclaration = function() {
    var isAsync;
    if (this.type === types$1._function || (isAsync = this.isAsyncFunction())) {
      var fNode = this.startNode();
      this.next();
      if (isAsync) { this.next(); }
      return this.parseFunction(fNode, FUNC_STATEMENT | FUNC_NULLABLE_ID, false, isAsync)
    } else if (this.type === types$1._class) {
      var cNode = this.startNode();
      return this.parseClass(cNode, "nullableID")
    } else {
      var declaration = this.parseMaybeAssign();
      this.semicolon();
      return declaration
    }
  };

  pp$8.checkExport = function(exports, name, pos) {
    if (!exports) { return }
    if (typeof name !== "string")
      { name = name.type === "Identifier" ? name.name : name.value; }
    if (hasOwn(exports, name))
      { this.raiseRecoverable(pos, "Duplicate export '" + name + "'"); }
    exports[name] = true;
  };

  pp$8.checkPatternExport = function(exports, pat) {
    var type = pat.type;
    if (type === "Identifier")
      { this.checkExport(exports, pat, pat.start); }
    else if (type === "ObjectPattern")
      { for (var i = 0, list = pat.properties; i < list.length; i += 1)
        {
          var prop = list[i];

          this.checkPatternExport(exports, prop);
        } }
    else if (type === "ArrayPattern")
      { for (var i$1 = 0, list$1 = pat.elements; i$1 < list$1.length; i$1 += 1) {
        var elt = list$1[i$1];

          if (elt) { this.checkPatternExport(exports, elt); }
      } }
    else if (type === "Property")
      { this.checkPatternExport(exports, pat.value); }
    else if (type === "AssignmentPattern")
      { this.checkPatternExport(exports, pat.left); }
    else if (type === "RestElement")
      { this.checkPatternExport(exports, pat.argument); }
  };

  pp$8.checkVariableExport = function(exports, decls) {
    if (!exports) { return }
    for (var i = 0, list = decls; i < list.length; i += 1)
      {
      var decl = list[i];

      this.checkPatternExport(exports, decl.id);
    }
  };

  pp$8.shouldParseExportStatement = function() {
    return this.type.keyword === "var" ||
      this.type.keyword === "const" ||
      this.type.keyword === "class" ||
      this.type.keyword === "function" ||
      this.isLet() ||
      this.isAsyncFunction()
  };

  // Parses a comma-separated list of module exports.

  pp$8.parseExportSpecifier = function(exports) {
    var node = this.startNode();
    node.local = this.parseModuleExportName();

    node.exported = this.eatContextual("as") ? this.parseModuleExportName() : node.local;
    this.checkExport(
      exports,
      node.exported,
      node.exported.start
    );

    return this.finishNode(node, "ExportSpecifier")
  };

  pp$8.parseExportSpecifiers = function(exports) {
    var nodes = [], first = true;
    // export { x, y as z } [from '...']
    this.expect(types$1.braceL);
    while (!this.eat(types$1.braceR)) {
      if (!first) {
        this.expect(types$1.comma);
        if (this.afterTrailingComma(types$1.braceR)) { break }
      } else { first = false; }

      nodes.push(this.parseExportSpecifier(exports));
    }
    return nodes
  };

  // Parses import declaration.

  pp$8.parseImport = function(node) {
    this.next();

    // import '...'
    if (this.type === types$1.string) {
      node.specifiers = empty$1;
      node.source = this.parseExprAtom();
    } else {
      node.specifiers = this.parseImportSpecifiers();
      this.expectContextual("from");
      node.source = this.type === types$1.string ? this.parseExprAtom() : this.unexpected();
    }
    if (this.options.ecmaVersion >= 16)
      { node.attributes = this.parseWithClause(); }
    this.semicolon();
    return this.finishNode(node, "ImportDeclaration")
  };

  // Parses a comma-separated list of module imports.

  pp$8.parseImportSpecifier = function() {
    var node = this.startNode();
    node.imported = this.parseModuleExportName();

    if (this.eatContextual("as")) {
      node.local = this.parseIdent();
    } else {
      this.checkUnreserved(node.imported);
      node.local = node.imported;
    }
    this.checkLValSimple(node.local, BIND_LEXICAL);

    return this.finishNode(node, "ImportSpecifier")
  };

  pp$8.parseImportDefaultSpecifier = function() {
    // import defaultObj, { x, y as z } from '...'
    var node = this.startNode();
    node.local = this.parseIdent();
    this.checkLValSimple(node.local, BIND_LEXICAL);
    return this.finishNode(node, "ImportDefaultSpecifier")
  };

  pp$8.parseImportNamespaceSpecifier = function() {
    var node = this.startNode();
    this.next();
    this.expectContextual("as");
    node.local = this.parseIdent();
    this.checkLValSimple(node.local, BIND_LEXICAL);
    return this.finishNode(node, "ImportNamespaceSpecifier")
  };

  pp$8.parseImportSpecifiers = function() {
    var nodes = [], first = true;
    if (this.type === types$1.name) {
      nodes.push(this.parseImportDefaultSpecifier());
      if (!this.eat(types$1.comma)) { return nodes }
    }
    if (this.type === types$1.star) {
      nodes.push(this.parseImportNamespaceSpecifier());
      return nodes
    }
    this.expect(types$1.braceL);
    while (!this.eat(types$1.braceR)) {
      if (!first) {
        this.expect(types$1.comma);
        if (this.afterTrailingComma(types$1.braceR)) { break }
      } else { first = false; }

      nodes.push(this.parseImportSpecifier());
    }
    return nodes
  };

  pp$8.parseWithClause = function() {
    var nodes = [];
    if (!this.eat(types$1._with)) {
      return nodes
    }
    this.expect(types$1.braceL);
    var attributeKeys = {};
    var first = true;
    while (!this.eat(types$1.braceR)) {
      if (!first) {
        this.expect(types$1.comma);
        if (this.afterTrailingComma(types$1.braceR)) { break }
      } else { first = false; }

      var attr = this.parseImportAttribute();
      var keyName = attr.key.type === "Identifier" ? attr.key.name : attr.key.value;
      if (hasOwn(attributeKeys, keyName))
        { this.raiseRecoverable(attr.key.start, "Duplicate attribute key '" + keyName + "'"); }
      attributeKeys[keyName] = true;
      nodes.push(attr);
    }
    return nodes
  };

  pp$8.parseImportAttribute = function() {
    var node = this.startNode();
    node.key = this.type === types$1.string ? this.parseExprAtom() : this.parseIdent(this.options.allowReserved !== "never");
    this.expect(types$1.colon);
    if (this.type !== types$1.string) {
      this.unexpected();
    }
    node.value = this.parseExprAtom();
    return this.finishNode(node, "ImportAttribute")
  };

  pp$8.parseModuleExportName = function() {
    if (this.options.ecmaVersion >= 13 && this.type === types$1.string) {
      var stringLiteral = this.parseLiteral(this.value);
      if (loneSurrogate.test(stringLiteral.value)) {
        this.raise(stringLiteral.start, "An export name cannot include a lone surrogate.");
      }
      return stringLiteral
    }
    return this.parseIdent(true)
  };

  // Set `ExpressionStatement#directive` property for directive prologues.
  pp$8.adaptDirectivePrologue = function(statements) {
    for (var i = 0; i < statements.length && this.isDirectiveCandidate(statements[i]); ++i) {
      statements[i].directive = statements[i].expression.raw.slice(1, -1);
    }
  };
  pp$8.isDirectiveCandidate = function(statement) {
    return (
      this.options.ecmaVersion >= 5 &&
      statement.type === "ExpressionStatement" &&
      statement.expression.type === "Literal" &&
      typeof statement.expression.value === "string" &&
      // Reject parenthesized strings.
      (this.input[statement.start] === "\"" || this.input[statement.start] === "'")
    )
  };

  var pp$7 = Parser.prototype;

  // Convert existing expression atom to assignable pattern
  // if possible.

  pp$7.toAssignable = function(node, isBinding, refDestructuringErrors) {
    if (this.options.ecmaVersion >= 6 && node) {
      switch (node.type) {
      case "Identifier":
        if (this.inAsync && node.name === "await")
          { this.raise(node.start, "Cannot use 'await' as identifier inside an async function"); }
        break

      case "ObjectPattern":
      case "ArrayPattern":
      case "AssignmentPattern":
      case "RestElement":
        break

      case "ObjectExpression":
        node.type = "ObjectPattern";
        if (refDestructuringErrors) { this.checkPatternErrors(refDestructuringErrors, true); }
        for (var i = 0, list = node.properties; i < list.length; i += 1) {
          var prop = list[i];

        this.toAssignable(prop, isBinding);
          // Early error:
          //   AssignmentRestProperty[Yield, Await] :
          //     `...` DestructuringAssignmentTarget[Yield, Await]
          //
          //   It is a Syntax Error if |DestructuringAssignmentTarget| is an |ArrayLiteral| or an |ObjectLiteral|.
          if (
            prop.type === "RestElement" &&
            (prop.argument.type === "ArrayPattern" || prop.argument.type === "ObjectPattern")
          ) {
            this.raise(prop.argument.start, "Unexpected token");
          }
        }
        break

      case "Property":
        // AssignmentProperty has type === "Property"
        if (node.kind !== "init") { this.raise(node.key.start, "Object pattern can't contain getter or setter"); }
        this.toAssignable(node.value, isBinding);
        break

      case "ArrayExpression":
        node.type = "ArrayPattern";
        if (refDestructuringErrors) { this.checkPatternErrors(refDestructuringErrors, true); }
        this.toAssignableList(node.elements, isBinding);
        break

      case "SpreadElement":
        node.type = "RestElement";
        this.toAssignable(node.argument, isBinding);
        if (node.argument.type === "AssignmentPattern")
          { this.raise(node.argument.start, "Rest elements cannot have a default value"); }
        break

      case "AssignmentExpression":
        if (node.operator !== "=") { this.raise(node.left.end, "Only '=' operator can be used for specifying default value."); }
        node.type = "AssignmentPattern";
        delete node.operator;
        this.toAssignable(node.left, isBinding);
        break

      case "ParenthesizedExpression":
        this.toAssignable(node.expression, isBinding, refDestructuringErrors);
        break

      case "ChainExpression":
        this.raiseRecoverable(node.start, "Optional chaining cannot appear in left-hand side");
        break

      case "MemberExpression":
        if (!isBinding) { break }

      default:
        this.raise(node.start, "Assigning to rvalue");
      }
    } else if (refDestructuringErrors) { this.checkPatternErrors(refDestructuringErrors, true); }
    return node
  };

  // Convert list of expression atoms to binding list.

  pp$7.toAssignableList = function(exprList, isBinding) {
    var end = exprList.length;
    for (var i = 0; i < end; i++) {
      var elt = exprList[i];
      if (elt) { this.toAssignable(elt, isBinding); }
    }
    if (end) {
      var last = exprList[end - 1];
      if (this.options.ecmaVersion === 6 && isBinding && last && last.type === "RestElement" && last.argument.type !== "Identifier")
        { this.unexpected(last.argument.start); }
    }
    return exprList
  };

  // Parses spread element.

  pp$7.parseSpread = function(refDestructuringErrors) {
    var node = this.startNode();
    this.next();
    node.argument = this.parseMaybeAssign(false, refDestructuringErrors);
    return this.finishNode(node, "SpreadElement")
  };

  pp$7.parseRestBinding = function() {
    var node = this.startNode();
    this.next();

    // RestElement inside of a function parameter must be an identifier
    if (this.options.ecmaVersion === 6 && this.type !== types$1.name)
      { this.unexpected(); }

    node.argument = this.parseBindingAtom();

    return this.finishNode(node, "RestElement")
  };

  // Parses lvalue (assignable) atom.

  pp$7.parseBindingAtom = function() {
    if (this.options.ecmaVersion >= 6) {
      switch (this.type) {
      case types$1.bracketL:
        var node = this.startNode();
        this.next();
        node.elements = this.parseBindingList(types$1.bracketR, true, true);
        return this.finishNode(node, "ArrayPattern")

      case types$1.braceL:
        return this.parseObj(true)
      }
    }
    return this.parseIdent()
  };

  pp$7.parseBindingList = function(close, allowEmpty, allowTrailingComma, allowModifiers) {
    var elts = [], first = true;
    while (!this.eat(close)) {
      if (first) { first = false; }
      else { this.expect(types$1.comma); }
      if (allowEmpty && this.type === types$1.comma) {
        elts.push(null);
      } else if (allowTrailingComma && this.afterTrailingComma(close)) {
        break
      } else if (this.type === types$1.ellipsis) {
        var rest = this.parseRestBinding();
        this.parseBindingListItem(rest);
        elts.push(rest);
        if (this.type === types$1.comma) { this.raiseRecoverable(this.start, "Comma is not permitted after the rest element"); }
        this.expect(close);
        break
      } else {
        elts.push(this.parseAssignableListItem(allowModifiers));
      }
    }
    return elts
  };

  pp$7.parseAssignableListItem = function(allowModifiers) {
    var elem = this.parseMaybeDefault(this.start, this.startLoc);
    this.parseBindingListItem(elem);
    return elem
  };

  pp$7.parseBindingListItem = function(param) {
    return param
  };

  // Parses assignment pattern around given atom if possible.

  pp$7.parseMaybeDefault = function(startPos, startLoc, left) {
    left = left || this.parseBindingAtom();
    if (this.options.ecmaVersion < 6 || !this.eat(types$1.eq)) { return left }
    var node = this.startNodeAt(startPos, startLoc);
    node.left = left;
    node.right = this.parseMaybeAssign();
    return this.finishNode(node, "AssignmentPattern")
  };

  // The following three functions all verify that a node is an lvalue —
  // something that can be bound, or assigned to. In order to do so, they perform
  // a variety of checks:
  //
  // - Check that none of the bound/assigned-to identifiers are reserved words.
  // - Record name declarations for bindings in the appropriate scope.
  // - Check duplicate argument names, if checkClashes is set.
  //
  // If a complex binding pattern is encountered (e.g., object and array
  // destructuring), the entire pattern is recursively checked.
  //
  // There are three versions of checkLVal*() appropriate for different
  // circumstances:
  //
  // - checkLValSimple() shall be used if the syntactic construct supports
  //   nothing other than identifiers and member expressions. Parenthesized
  //   expressions are also correctly handled. This is generally appropriate for
  //   constructs for which the spec says
  //
  //   > It is a Syntax Error if AssignmentTargetType of [the production] is not
  //   > simple.
  //
  //   It is also appropriate for checking if an identifier is valid and not
  //   defined elsewhere, like import declarations or function/class identifiers.
  //
  //   Examples where this is used include:
  //     a += …;
  //     import a from '…';
  //   where a is the node to be checked.
  //
  // - checkLValPattern() shall be used if the syntactic construct supports
  //   anything checkLValSimple() supports, as well as object and array
  //   destructuring patterns. This is generally appropriate for constructs for
  //   which the spec says
  //
  //   > It is a Syntax Error if [the production] is neither an ObjectLiteral nor
  //   > an ArrayLiteral and AssignmentTargetType of [the production] is not
  //   > simple.
  //
  //   Examples where this is used include:
  //     (a = …);
  //     const a = …;
  //     try { … } catch (a) { … }
  //   where a is the node to be checked.
  //
  // - checkLValInnerPattern() shall be used if the syntactic construct supports
  //   anything checkLValPattern() supports, as well as default assignment
  //   patterns, rest elements, and other constructs that may appear within an
  //   object or array destructuring pattern.
  //
  //   As a special case, function parameters also use checkLValInnerPattern(),
  //   as they also support defaults and rest constructs.
  //
  // These functions deliberately support both assignment and binding constructs,
  // as the logic for both is exceedingly similar. If the node is the target of
  // an assignment, then bindingType should be set to BIND_NONE. Otherwise, it
  // should be set to the appropriate BIND_* constant, like BIND_VAR or
  // BIND_LEXICAL.
  //
  // If the function is called with a non-BIND_NONE bindingType, then
  // additionally a checkClashes object may be specified to allow checking for
  // duplicate argument names. checkClashes is ignored if the provided construct
  // is an assignment (i.e., bindingType is BIND_NONE).

  pp$7.checkLValSimple = function(expr, bindingType, checkClashes) {
    if ( bindingType === void 0 ) bindingType = BIND_NONE;

    var isBind = bindingType !== BIND_NONE;

    switch (expr.type) {
    case "Identifier":
      if (this.strict && this.reservedWordsStrictBind.test(expr.name))
        { this.raiseRecoverable(expr.start, (isBind ? "Binding " : "Assigning to ") + expr.name + " in strict mode"); }
      if (isBind) {
        if (bindingType === BIND_LEXICAL && expr.name === "let")
          { this.raiseRecoverable(expr.start, "let is disallowed as a lexically bound name"); }
        if (checkClashes) {
          if (hasOwn(checkClashes, expr.name))
            { this.raiseRecoverable(expr.start, "Argument name clash"); }
          checkClashes[expr.name] = true;
        }
        if (bindingType !== BIND_OUTSIDE) { this.declareName(expr.name, bindingType, expr.start); }
      }
      break

    case "ChainExpression":
      this.raiseRecoverable(expr.start, "Optional chaining cannot appear in left-hand side");
      break

    case "MemberExpression":
      if (isBind) { this.raiseRecoverable(expr.start, "Binding member expression"); }
      break

    case "ParenthesizedExpression":
      if (isBind) { this.raiseRecoverable(expr.start, "Binding parenthesized expression"); }
      return this.checkLValSimple(expr.expression, bindingType, checkClashes)

    default:
      this.raise(expr.start, (isBind ? "Binding" : "Assigning to") + " rvalue");
    }
  };

  pp$7.checkLValPattern = function(expr, bindingType, checkClashes) {
    if ( bindingType === void 0 ) bindingType = BIND_NONE;

    switch (expr.type) {
    case "ObjectPattern":
      for (var i = 0, list = expr.properties; i < list.length; i += 1) {
        var prop = list[i];

      this.checkLValInnerPattern(prop, bindingType, checkClashes);
      }
      break

    case "ArrayPattern":
      for (var i$1 = 0, list$1 = expr.elements; i$1 < list$1.length; i$1 += 1) {
        var elem = list$1[i$1];

      if (elem) { this.checkLValInnerPattern(elem, bindingType, checkClashes); }
      }
      break

    default:
      this.checkLValSimple(expr, bindingType, checkClashes);
    }
  };

  pp$7.checkLValInnerPattern = function(expr, bindingType, checkClashes) {
    if ( bindingType === void 0 ) bindingType = BIND_NONE;

    switch (expr.type) {
    case "Property":
      // AssignmentProperty has type === "Property"
      this.checkLValInnerPattern(expr.value, bindingType, checkClashes);
      break

    case "AssignmentPattern":
      this.checkLValPattern(expr.left, bindingType, checkClashes);
      break

    case "RestElement":
      this.checkLValPattern(expr.argument, bindingType, checkClashes);
      break

    default:
      this.checkLValPattern(expr, bindingType, checkClashes);
    }
  };

  // The algorithm used to determine whether a regexp can appear at a
  // given point in the program is loosely based on sweet.js' approach.
  // See https://github.com/mozilla/sweet.js/wiki/design


  var TokContext = function TokContext(token, isExpr, preserveSpace, override, generator) {
    this.token = token;
    this.isExpr = !!isExpr;
    this.preserveSpace = !!preserveSpace;
    this.override = override;
    this.generator = !!generator;
  };

  var types = {
    b_stat: new TokContext("{", false),
    b_expr: new TokContext("{", true),
    b_tmpl: new TokContext("${", false),
    p_stat: new TokContext("(", false),
    p_expr: new TokContext("(", true),
    q_tmpl: new TokContext("`", true, true, function (p) { return p.tryReadTemplateToken(); }),
    f_stat: new TokContext("function", false),
    f_expr: new TokContext("function", true),
    f_expr_gen: new TokContext("function", true, false, null, true),
    f_gen: new TokContext("function", false, false, null, true)
  };

  var pp$6 = Parser.prototype;

  pp$6.initialContext = function() {
    return [types.b_stat]
  };

  pp$6.curContext = function() {
    return this.context[this.context.length - 1]
  };

  pp$6.braceIsBlock = function(prevType) {
    var parent = this.curContext();
    if (parent === types.f_expr || parent === types.f_stat)
      { return true }
    if (prevType === types$1.colon && (parent === types.b_stat || parent === types.b_expr))
      { return !parent.isExpr }

    // The check for `tt.name && exprAllowed` detects whether we are
    // after a `yield` or `of` construct. See the `updateContext` for
    // `tt.name`.
    if (prevType === types$1._return || prevType === types$1.name && this.exprAllowed)
      { return lineBreak.test(this.input.slice(this.lastTokEnd, this.start)) }
    if (prevType === types$1._else || prevType === types$1.semi || prevType === types$1.eof || prevType === types$1.parenR || prevType === types$1.arrow)
      { return true }
    if (prevType === types$1.braceL)
      { return parent === types.b_stat }
    if (prevType === types$1._var || prevType === types$1._const || prevType === types$1.name)
      { return false }
    return !this.exprAllowed
  };

  pp$6.inGeneratorContext = function() {
    for (var i = this.context.length - 1; i >= 1; i--) {
      var context = this.context[i];
      if (context.token === "function")
        { return context.generator }
    }
    return false
  };

  pp$6.updateContext = function(prevType) {
    var update, type = this.type;
    if (type.keyword && prevType === types$1.dot)
      { this.exprAllowed = false; }
    else if (update = type.updateContext)
      { update.call(this, prevType); }
    else
      { this.exprAllowed = type.beforeExpr; }
  };

  // Used to handle edge cases when token context could not be inferred correctly during tokenization phase

  pp$6.overrideContext = function(tokenCtx) {
    if (this.curContext() !== tokenCtx) {
      this.context[this.context.length - 1] = tokenCtx;
    }
  };

  // Token-specific context update code

  types$1.parenR.updateContext = types$1.braceR.updateContext = function() {
    if (this.context.length === 1) {
      this.exprAllowed = true;
      return
    }
    var out = this.context.pop();
    if (out === types.b_stat && this.curContext().token === "function") {
      out = this.context.pop();
    }
    this.exprAllowed = !out.isExpr;
  };

  types$1.braceL.updateContext = function(prevType) {
    this.context.push(this.braceIsBlock(prevType) ? types.b_stat : types.b_expr);
    this.exprAllowed = true;
  };

  types$1.dollarBraceL.updateContext = function() {
    this.context.push(types.b_tmpl);
    this.exprAllowed = true;
  };

  types$1.parenL.updateContext = function(prevType) {
    var statementParens = prevType === types$1._if || prevType === types$1._for || prevType === types$1._with || prevType === types$1._while;
    this.context.push(statementParens ? types.p_stat : types.p_expr);
    this.exprAllowed = true;
  };

  types$1.incDec.updateContext = function() {
    // tokExprAllowed stays unchanged
  };

  types$1._function.updateContext = types$1._class.updateContext = function(prevType) {
    if (prevType.beforeExpr && prevType !== types$1._else &&
        !(prevType === types$1.semi && this.curContext() !== types.p_stat) &&
        !(prevType === types$1._return && lineBreak.test(this.input.slice(this.lastTokEnd, this.start))) &&
        !((prevType === types$1.colon || prevType === types$1.braceL) && this.curContext() === types.b_stat))
      { this.context.push(types.f_expr); }
    else
      { this.context.push(types.f_stat); }
    this.exprAllowed = false;
  };

  types$1.colon.updateContext = function() {
    if (this.curContext().token === "function") { this.context.pop(); }
    this.exprAllowed = true;
  };

  types$1.backQuote.updateContext = function() {
    if (this.curContext() === types.q_tmpl)
      { this.context.pop(); }
    else
      { this.context.push(types.q_tmpl); }
    this.exprAllowed = false;
  };

  types$1.star.updateContext = function(prevType) {
    if (prevType === types$1._function) {
      var index = this.context.length - 1;
      if (this.context[index] === types.f_expr)
        { this.context[index] = types.f_expr_gen; }
      else
        { this.context[index] = types.f_gen; }
    }
    this.exprAllowed = true;
  };

  types$1.name.updateContext = function(prevType) {
    var allowed = false;
    if (this.options.ecmaVersion >= 6 && prevType !== types$1.dot) {
      if (this.value === "of" && !this.exprAllowed ||
          this.value === "yield" && this.inGeneratorContext())
        { allowed = true; }
    }
    this.exprAllowed = allowed;
  };

  // A recursive descent parser operates by defining functions for all
  // syntactic elements, and recursively calling those, each function
  // advancing the input stream and returning an AST node. Precedence
  // of constructs (for example, the fact that `!x[1]` means `!(x[1])`
  // instead of `(!x)[1]` is handled by the fact that the parser
  // function that parses unary prefix operators is called first, and
  // in turn calls the function that parses `[]` subscripts — that
  // way, it'll receive the node for `x[1]` already parsed, and wraps
  // *that* in the unary operator node.
  //
  // Acorn uses an [operator precedence parser][opp] to handle binary
  // operator precedence, because it is much more compact than using
  // the technique outlined above, which uses different, nesting
  // functions to specify precedence, for all of the ten binary
  // precedence levels that JavaScript defines.
  //
  // [opp]: http://en.wikipedia.org/wiki/Operator-precedence_parser


  var pp$5 = Parser.prototype;

  // Check if property name clashes with already added.
  // Object/class getters and setters are not allowed to clash —
  // either with each other or with an init property — and in
  // strict mode, init properties are also not allowed to be repeated.

  pp$5.checkPropClash = function(prop, propHash, refDestructuringErrors) {
    if (this.options.ecmaVersion >= 9 && prop.type === "SpreadElement")
      { return }
    if (this.options.ecmaVersion >= 6 && (prop.computed || prop.method || prop.shorthand))
      { return }
    var key = prop.key;
    var name;
    switch (key.type) {
    case "Identifier": name = key.name; break
    case "Literal": name = String(key.value); break
    default: return
    }
    var kind = prop.kind;
    if (this.options.ecmaVersion >= 6) {
      if (name === "__proto__" && kind === "init") {
        if (propHash.proto) {
          if (refDestructuringErrors) {
            if (refDestructuringErrors.doubleProto < 0) {
              refDestructuringErrors.doubleProto = key.start;
            }
          } else {
            this.raiseRecoverable(key.start, "Redefinition of __proto__ property");
          }
        }
        propHash.proto = true;
      }
      return
    }
    name = "$" + name;
    var other = propHash[name];
    if (other) {
      var redefinition;
      if (kind === "init") {
        redefinition = this.strict && other.init || other.get || other.set;
      } else {
        redefinition = other.init || other[kind];
      }
      if (redefinition)
        { this.raiseRecoverable(key.start, "Redefinition of property"); }
    } else {
      other = propHash[name] = {
        init: false,
        get: false,
        set: false
      };
    }
    other[kind] = true;
  };

  // ### Expression parsing

  // These nest, from the most general expression type at the top to
  // 'atomic', nondivisible expression types at the bottom. Most of
  // the functions will simply let the function(s) below them parse,
  // and, *if* the syntactic construct they handle is present, wrap
  // the AST node that the inner parser gave them in another node.

  // Parse a full expression. The optional arguments are used to
  // forbid the `in` operator (in for loops initalization expressions)
  // and provide reference for storing '=' operator inside shorthand
  // property assignment in contexts where both object expression
  // and object pattern might appear (so it's possible to raise
  // delayed syntax error at correct position).

  pp$5.parseExpression = function(forInit, refDestructuringErrors) {
    var startPos = this.start, startLoc = this.startLoc;
    var expr = this.parseMaybeAssign(forInit, refDestructuringErrors);
    if (this.type === types$1.comma) {
      var node = this.startNodeAt(startPos, startLoc);
      node.expressions = [expr];
      while (this.eat(types$1.comma)) { node.expressions.push(this.parseMaybeAssign(forInit, refDestructuringErrors)); }
      return this.finishNode(node, "SequenceExpression")
    }
    return expr
  };

  // Parse an assignment expression. This includes applications of
  // operators like `+=`.

  pp$5.parseMaybeAssign = function(forInit, refDestructuringErrors, afterLeftParse) {
    if (this.isContextual("yield")) {
      if (this.inGenerator) { return this.parseYield(forInit) }
      // The tokenizer will assume an expression is allowed after
      // `yield`, but this isn't that kind of yield
      else { this.exprAllowed = false; }
    }

    var ownDestructuringErrors = false, oldParenAssign = -1, oldTrailingComma = -1, oldDoubleProto = -1;
    if (refDestructuringErrors) {
      oldParenAssign = refDestructuringErrors.parenthesizedAssign;
      oldTrailingComma = refDestructuringErrors.trailingComma;
      oldDoubleProto = refDestructuringErrors.doubleProto;
      refDestructuringErrors.parenthesizedAssign = refDestructuringErrors.trailingComma = -1;
    } else {
      refDestructuringErrors = new DestructuringErrors;
      ownDestructuringErrors = true;
    }

    var startPos = this.start, startLoc = this.startLoc;
    if (this.type === types$1.parenL || this.type === types$1.name) {
      this.potentialArrowAt = this.start;
      this.potentialArrowInForAwait = forInit === "await";
    }
    var left = this.parseMaybeConditional(forInit, refDestructuringErrors);
    if (afterLeftParse) { left = afterLeftParse.call(this, left, startPos, startLoc); }
    if (this.type.isAssign) {
      var node = this.startNodeAt(startPos, startLoc);
      node.operator = this.value;
      if (this.type === types$1.eq)
        { left = this.toAssignable(left, false, refDestructuringErrors); }
      if (!ownDestructuringErrors) {
        refDestructuringErrors.parenthesizedAssign = refDestructuringErrors.trailingComma = refDestructuringErrors.doubleProto = -1;
      }
      if (refDestructuringErrors.shorthandAssign >= left.start)
        { refDestructuringErrors.shorthandAssign = -1; } // reset because shorthand default was used correctly
      if (this.type === types$1.eq)
        { this.checkLValPattern(left); }
      else
        { this.checkLValSimple(left); }
      node.left = left;
      this.next();
      node.right = this.parseMaybeAssign(forInit);
      if (oldDoubleProto > -1) { refDestructuringErrors.doubleProto = oldDoubleProto; }
      return this.finishNode(node, "AssignmentExpression")
    } else {
      if (ownDestructuringErrors) { this.checkExpressionErrors(refDestructuringErrors, true); }
    }
    if (oldParenAssign > -1) { refDestructuringErrors.parenthesizedAssign = oldParenAssign; }
    if (oldTrailingComma > -1) { refDestructuringErrors.trailingComma = oldTrailingComma; }
    return left
  };

  // Parse a ternary conditional (`?:`) operator.

  pp$5.parseMaybeConditional = function(forInit, refDestructuringErrors) {
    var startPos = this.start, startLoc = this.startLoc;
    var expr = this.parseExprOps(forInit, refDestructuringErrors);
    if (this.checkExpressionErrors(refDestructuringErrors)) { return expr }
    if (this.eat(types$1.question)) {
      var node = this.startNodeAt(startPos, startLoc);
      node.test = expr;
      node.consequent = this.parseMaybeAssign();
      this.expect(types$1.colon);
      node.alternate = this.parseMaybeAssign(forInit);
      return this.finishNode(node, "ConditionalExpression")
    }
    return expr
  };

  // Start the precedence parser.

  pp$5.parseExprOps = function(forInit, refDestructuringErrors) {
    var startPos = this.start, startLoc = this.startLoc;
    var expr = this.parseMaybeUnary(refDestructuringErrors, false, false, forInit);
    if (this.checkExpressionErrors(refDestructuringErrors)) { return expr }
    return expr.start === startPos && expr.type === "ArrowFunctionExpression" ? expr : this.parseExprOp(expr, startPos, startLoc, -1, forInit)
  };

  // Parse binary operators with the operator precedence parsing
  // algorithm. `left` is the left-hand side of the operator.
  // `minPrec` provides context that allows the function to stop and
  // defer further parser to one of its callers when it encounters an
  // operator that has a lower precedence than the set it is parsing.

  pp$5.parseExprOp = function(left, leftStartPos, leftStartLoc, minPrec, forInit) {
    var prec = this.type.binop;
    if (prec != null && (!forInit || this.type !== types$1._in)) {
      if (prec > minPrec) {
        var logical = this.type === types$1.logicalOR || this.type === types$1.logicalAND;
        var coalesce = this.type === types$1.coalesce;
        if (coalesce) {
          // Handle the precedence of `tt.coalesce` as equal to the range of logical expressions.
          // In other words, `node.right` shouldn't contain logical expressions in order to check the mixed error.
          prec = types$1.logicalAND.binop;
        }
        var op = this.value;
        this.next();
        var startPos = this.start, startLoc = this.startLoc;
        var right = this.parseExprOp(this.parseMaybeUnary(null, false, false, forInit), startPos, startLoc, prec, forInit);
        var node = this.buildBinary(leftStartPos, leftStartLoc, left, right, op, logical || coalesce);
        if ((logical && this.type === types$1.coalesce) || (coalesce && (this.type === types$1.logicalOR || this.type === types$1.logicalAND))) {
          this.raiseRecoverable(this.start, "Logical expressions and coalesce expressions cannot be mixed. Wrap either by parentheses");
        }
        return this.parseExprOp(node, leftStartPos, leftStartLoc, minPrec, forInit)
      }
    }
    return left
  };

  pp$5.buildBinary = function(startPos, startLoc, left, right, op, logical) {
    if (right.type === "PrivateIdentifier") { this.raise(right.start, "Private identifier can only be left side of binary expression"); }
    var node = this.startNodeAt(startPos, startLoc);
    node.left = left;
    node.operator = op;
    node.right = right;
    return this.finishNode(node, logical ? "LogicalExpression" : "BinaryExpression")
  };

  // Parse unary operators, both prefix and postfix.

  pp$5.parseMaybeUnary = function(refDestructuringErrors, sawUnary, incDec, forInit) {
    var startPos = this.start, startLoc = this.startLoc, expr;
    if (this.isContextual("await") && this.canAwait) {
      expr = this.parseAwait(forInit);
      sawUnary = true;
    } else if (this.type.prefix) {
      var node = this.startNode(), update = this.type === types$1.incDec;
      node.operator = this.value;
      node.prefix = true;
      this.next();
      node.argument = this.parseMaybeUnary(null, true, update, forInit);
      this.checkExpressionErrors(refDestructuringErrors, true);
      if (update) { this.checkLValSimple(node.argument); }
      else if (this.strict && node.operator === "delete" && isLocalVariableAccess(node.argument))
        { this.raiseRecoverable(node.start, "Deleting local variable in strict mode"); }
      else if (node.operator === "delete" && isPrivateFieldAccess(node.argument))
        { this.raiseRecoverable(node.start, "Private fields can not be deleted"); }
      else { sawUnary = true; }
      expr = this.finishNode(node, update ? "UpdateExpression" : "UnaryExpression");
    } else if (!sawUnary && this.type === types$1.privateId) {
      if ((forInit || this.privateNameStack.length === 0) && this.options.checkPrivateFields) { this.unexpected(); }
      expr = this.parsePrivateIdent();
      // only could be private fields in 'in', such as #x in obj
      if (this.type !== types$1._in) { this.unexpected(); }
    } else {
      expr = this.parseExprSubscripts(refDestructuringErrors, forInit);
      if (this.checkExpressionErrors(refDestructuringErrors)) { return expr }
      while (this.type.postfix && !this.canInsertSemicolon()) {
        var node$1 = this.startNodeAt(startPos, startLoc);
        node$1.operator = this.value;
        node$1.prefix = false;
        node$1.argument = expr;
        this.checkLValSimple(expr);
        this.next();
        expr = this.finishNode(node$1, "UpdateExpression");
      }
    }

    if (!incDec && this.eat(types$1.starstar)) {
      if (sawUnary)
        { this.unexpected(this.lastTokStart); }
      else
        { return this.buildBinary(startPos, startLoc, expr, this.parseMaybeUnary(null, false, false, forInit), "**", false) }
    } else {
      return expr
    }
  };

  function isLocalVariableAccess(node) {
    return (
      node.type === "Identifier" ||
      node.type === "ParenthesizedExpression" && isLocalVariableAccess(node.expression)
    )
  }

  function isPrivateFieldAccess(node) {
    return (
      node.type === "MemberExpression" && node.property.type === "PrivateIdentifier" ||
      node.type === "ChainExpression" && isPrivateFieldAccess(node.expression) ||
      node.type === "ParenthesizedExpression" && isPrivateFieldAccess(node.expression)
    )
  }

  // Parse call, dot, and `[]`-subscript expressions.

  pp$5.parseExprSubscripts = function(refDestructuringErrors, forInit) {
    var startPos = this.start, startLoc = this.startLoc;
    var expr = this.parseExprAtom(refDestructuringErrors, forInit);
    if (expr.type === "ArrowFunctionExpression" && this.input.slice(this.lastTokStart, this.lastTokEnd) !== ")")
      { return expr }
    var result = this.parseSubscripts(expr, startPos, startLoc, false, forInit);
    if (refDestructuringErrors && result.type === "MemberExpression") {
      if (refDestructuringErrors.parenthesizedAssign >= result.start) { refDestructuringErrors.parenthesizedAssign = -1; }
      if (refDestructuringErrors.parenthesizedBind >= result.start) { refDestructuringErrors.parenthesizedBind = -1; }
      if (refDestructuringErrors.trailingComma >= result.start) { refDestructuringErrors.trailingComma = -1; }
    }
    return result
  };

  pp$5.parseSubscripts = function(base, startPos, startLoc, noCalls, forInit) {
    var maybeAsyncArrow = this.options.ecmaVersion >= 8 && base.type === "Identifier" && base.name === "async" &&
        this.lastTokEnd === base.end && !this.canInsertSemicolon() && base.end - base.start === 5 &&
        this.potentialArrowAt === base.start;
    var optionalChained = false;

    while (true) {
      var element = this.parseSubscript(base, startPos, startLoc, noCalls, maybeAsyncArrow, optionalChained, forInit);

      if (element.optional) { optionalChained = true; }
      if (element === base || element.type === "ArrowFunctionExpression") {
        if (optionalChained) {
          var chainNode = this.startNodeAt(startPos, startLoc);
          chainNode.expression = element;
          element = this.finishNode(chainNode, "ChainExpression");
        }
        return element
      }

      base = element;
    }
  };

  pp$5.shouldParseAsyncArrow = function() {
    return !this.canInsertSemicolon() && this.eat(types$1.arrow)
  };

  pp$5.parseSubscriptAsyncArrow = function(startPos, startLoc, exprList, forInit) {
    return this.parseArrowExpression(this.startNodeAt(startPos, startLoc), exprList, true, forInit)
  };

  pp$5.parseSubscript = function(base, startPos, startLoc, noCalls, maybeAsyncArrow, optionalChained, forInit) {
    var optionalSupported = this.options.ecmaVersion >= 11;
    var optional = optionalSupported && this.eat(types$1.questionDot);
    if (noCalls && optional) { this.raise(this.lastTokStart, "Optional chaining cannot appear in the callee of new expressions"); }

    var computed = this.eat(types$1.bracketL);
    if (computed || (optional && this.type !== types$1.parenL && this.type !== types$1.backQuote) || this.eat(types$1.dot)) {
      var node = this.startNodeAt(startPos, startLoc);
      node.object = base;
      if (computed) {
        node.property = this.parseExpression();
        this.expect(types$1.bracketR);
      } else if (this.type === types$1.privateId && base.type !== "Super") {
        node.property = this.parsePrivateIdent();
      } else {
        node.property = this.parseIdent(this.options.allowReserved !== "never");
      }
      node.computed = !!computed;
      if (optionalSupported) {
        node.optional = optional;
      }
      base = this.finishNode(node, "MemberExpression");
    } else if (!noCalls && this.eat(types$1.parenL)) {
      var refDestructuringErrors = new DestructuringErrors, oldYieldPos = this.yieldPos, oldAwaitPos = this.awaitPos, oldAwaitIdentPos = this.awaitIdentPos;
      this.yieldPos = 0;
      this.awaitPos = 0;
      this.awaitIdentPos = 0;
      var exprList = this.parseExprList(types$1.parenR, this.options.ecmaVersion >= 8, false, refDestructuringErrors);
      if (maybeAsyncArrow && !optional && this.shouldParseAsyncArrow()) {
        this.checkPatternErrors(refDestructuringErrors, false);
        this.checkYieldAwaitInDefaultParams();
        if (this.awaitIdentPos > 0)
          { this.raise(this.awaitIdentPos, "Cannot use 'await' as identifier inside an async function"); }
        this.yieldPos = oldYieldPos;
        this.awaitPos = oldAwaitPos;
        this.awaitIdentPos = oldAwaitIdentPos;
        return this.parseSubscriptAsyncArrow(startPos, startLoc, exprList, forInit)
      }
      this.checkExpressionErrors(refDestructuringErrors, true);
      this.yieldPos = oldYieldPos || this.yieldPos;
      this.awaitPos = oldAwaitPos || this.awaitPos;
      this.awaitIdentPos = oldAwaitIdentPos || this.awaitIdentPos;
      var node$1 = this.startNodeAt(startPos, startLoc);
      node$1.callee = base;
      node$1.arguments = exprList;
      if (optionalSupported) {
        node$1.optional = optional;
      }
      base = this.finishNode(node$1, "CallExpression");
    } else if (this.type === types$1.backQuote) {
      if (optional || optionalChained) {
        this.raise(this.start, "Optional chaining cannot appear in the tag of tagged template expressions");
      }
      var node$2 = this.startNodeAt(startPos, startLoc);
      node$2.tag = base;
      node$2.quasi = this.parseTemplate({isTagged: true});
      base = this.finishNode(node$2, "TaggedTemplateExpression");
    }
    return base
  };

  // Parse an atomic expression — either a single token that is an
  // expression, an expression started by a keyword like `function` or
  // `new`, or an expression wrapped in punctuation like `()`, `[]`,
  // or `{}`.

  pp$5.parseExprAtom = function(refDestructuringErrors, forInit, forNew) {
    // If a division operator appears in an expression position, the
    // tokenizer got confused, and we force it to read a regexp instead.
    if (this.type === types$1.slash) { this.readRegexp(); }

    var node, canBeArrow = this.potentialArrowAt === this.start;
    switch (this.type) {
    case types$1._super:
      if (!this.allowSuper)
        { this.raise(this.start, "'super' keyword outside a method"); }
      node = this.startNode();
      this.next();
      if (this.type === types$1.parenL && !this.allowDirectSuper)
        { this.raise(node.start, "super() call outside constructor of a subclass"); }
      // The `super` keyword can appear at below:
      // SuperProperty:
      //     super [ Expression ]
      //     super . IdentifierName
      // SuperCall:
      //     super ( Arguments )
      if (this.type !== types$1.dot && this.type !== types$1.bracketL && this.type !== types$1.parenL)
        { this.unexpected(); }
      return this.finishNode(node, "Super")

    case types$1._this:
      node = this.startNode();
      this.next();
      return this.finishNode(node, "ThisExpression")

    case types$1.name:
      var startPos = this.start, startLoc = this.startLoc, containsEsc = this.containsEsc;
      var id = this.parseIdent(false);
      if (this.options.ecmaVersion >= 8 && !containsEsc && id.name === "async" && !this.canInsertSemicolon() && this.eat(types$1._function)) {
        this.overrideContext(types.f_expr);
        return this.parseFunction(this.startNodeAt(startPos, startLoc), 0, false, true, forInit)
      }
      if (canBeArrow && !this.canInsertSemicolon()) {
        if (this.eat(types$1.arrow))
          { return this.parseArrowExpression(this.startNodeAt(startPos, startLoc), [id], false, forInit) }
        if (this.options.ecmaVersion >= 8 && id.name === "async" && this.type === types$1.name && !containsEsc &&
            (!this.potentialArrowInForAwait || this.value !== "of" || this.containsEsc)) {
          id = this.parseIdent(false);
          if (this.canInsertSemicolon() || !this.eat(types$1.arrow))
            { this.unexpected(); }
          return this.parseArrowExpression(this.startNodeAt(startPos, startLoc), [id], true, forInit)
        }
      }
      return id

    case types$1.regexp:
      var value = this.value;
      node = this.parseLiteral(value.value);
      node.regex = {pattern: value.pattern, flags: value.flags};
      return node

    case types$1.num: case types$1.string:
      return this.parseLiteral(this.value)

    case types$1._null: case types$1._true: case types$1._false:
      node = this.startNode();
      node.value = this.type === types$1._null ? null : this.type === types$1._true;
      node.raw = this.type.keyword;
      this.next();
      return this.finishNode(node, "Literal")

    case types$1.parenL:
      var start = this.start, expr = this.parseParenAndDistinguishExpression(canBeArrow, forInit);
      if (refDestructuringErrors) {
        if (refDestructuringErrors.parenthesizedAssign < 0 && !this.isSimpleAssignTarget(expr))
          { refDestructuringErrors.parenthesizedAssign = start; }
        if (refDestructuringErrors.parenthesizedBind < 0)
          { refDestructuringErrors.parenthesizedBind = start; }
      }
      return expr

    case types$1.bracketL:
      node = this.startNode();
      this.next();
      node.elements = this.parseExprList(types$1.bracketR, true, true, refDestructuringErrors);
      return this.finishNode(node, "ArrayExpression")

    case types$1.braceL:
      this.overrideContext(types.b_expr);
      return this.parseObj(false, refDestructuringErrors)

    case types$1._function:
      node = this.startNode();
      this.next();
      return this.parseFunction(node, 0)

    case types$1._class:
      return this.parseClass(this.startNode(), false)

    case types$1._new:
      return this.parseNew()

    case types$1.backQuote:
      return this.parseTemplate()

    case types$1._import:
      if (this.options.ecmaVersion >= 11) {
        return this.parseExprImport(forNew)
      } else {
        return this.unexpected()
      }

    default:
      return this.parseExprAtomDefault()
    }
  };

  pp$5.parseExprAtomDefault = function() {
    this.unexpected();
  };

  pp$5.parseExprImport = function(forNew) {
    var node = this.startNode();

    // Consume `import` as an identifier for `import.meta`.
    // Because `this.parseIdent(true)` doesn't check escape sequences, it needs the check of `this.containsEsc`.
    if (this.containsEsc) { this.raiseRecoverable(this.start, "Escape sequence in keyword import"); }
    this.next();

    if (this.type === types$1.parenL && !forNew) {
      return this.parseDynamicImport(node)
    } else if (this.type === types$1.dot) {
      var meta = this.startNodeAt(node.start, node.loc && node.loc.start);
      meta.name = "import";
      node.meta = this.finishNode(meta, "Identifier");
      return this.parseImportMeta(node)
    } else {
      this.unexpected();
    }
  };

  pp$5.parseDynamicImport = function(node) {
    this.next(); // skip `(`

    // Parse node.source.
    node.source = this.parseMaybeAssign();

    if (this.options.ecmaVersion >= 16) {
      if (!this.eat(types$1.parenR)) {
        this.expect(types$1.comma);
        if (!this.afterTrailingComma(types$1.parenR)) {
          node.options = this.parseMaybeAssign();
          if (!this.eat(types$1.parenR)) {
            this.expect(types$1.comma);
            if (!this.afterTrailingComma(types$1.parenR)) {
              this.unexpected();
            }
          }
        } else {
          node.options = null;
        }
      } else {
        node.options = null;
      }
    } else {
      // Verify ending.
      if (!this.eat(types$1.parenR)) {
        var errorPos = this.start;
        if (this.eat(types$1.comma) && this.eat(types$1.parenR)) {
          this.raiseRecoverable(errorPos, "Trailing comma is not allowed in import()");
        } else {
          this.unexpected(errorPos);
        }
      }
    }

    return this.finishNode(node, "ImportExpression")
  };

  pp$5.parseImportMeta = function(node) {
    this.next(); // skip `.`

    var containsEsc = this.containsEsc;
    node.property = this.parseIdent(true);

    if (node.property.name !== "meta")
      { this.raiseRecoverable(node.property.start, "The only valid meta property for import is 'import.meta'"); }
    if (containsEsc)
      { this.raiseRecoverable(node.start, "'import.meta' must not contain escaped characters"); }
    if (this.options.sourceType !== "module" && !this.options.allowImportExportEverywhere)
      { this.raiseRecoverable(node.start, "Cannot use 'import.meta' outside a module"); }

    return this.finishNode(node, "MetaProperty")
  };

  pp$5.parseLiteral = function(value) {
    var node = this.startNode();
    node.value = value;
    node.raw = this.input.slice(this.start, this.end);
    if (node.raw.charCodeAt(node.raw.length - 1) === 110)
      { node.bigint = node.value != null ? node.value.toString() : node.raw.slice(0, -1).replace(/_/g, ""); }
    this.next();
    return this.finishNode(node, "Literal")
  };

  pp$5.parseParenExpression = function() {
    this.expect(types$1.parenL);
    var val = this.parseExpression();
    this.expect(types$1.parenR);
    return val
  };

  pp$5.shouldParseArrow = function(exprList) {
    return !this.canInsertSemicolon()
  };

  pp$5.parseParenAndDistinguishExpression = function(canBeArrow, forInit) {
    var startPos = this.start, startLoc = this.startLoc, val, allowTrailingComma = this.options.ecmaVersion >= 8;
    if (this.options.ecmaVersion >= 6) {
      this.next();

      var innerStartPos = this.start, innerStartLoc = this.startLoc;
      var exprList = [], first = true, lastIsComma = false;
      var refDestructuringErrors = new DestructuringErrors, oldYieldPos = this.yieldPos, oldAwaitPos = this.awaitPos, spreadStart;
      this.yieldPos = 0;
      this.awaitPos = 0;
      // Do not save awaitIdentPos to allow checking awaits nested in parameters
      while (this.type !== types$1.parenR) {
        first ? first = false : this.expect(types$1.comma);
        if (allowTrailingComma && this.afterTrailingComma(types$1.parenR, true)) {
          lastIsComma = true;
          break
        } else if (this.type === types$1.ellipsis) {
          spreadStart = this.start;
          exprList.push(this.parseParenItem(this.parseRestBinding()));
          if (this.type === types$1.comma) {
            this.raiseRecoverable(
              this.start,
              "Comma is not permitted after the rest element"
            );
          }
          break
        } else {
          exprList.push(this.parseMaybeAssign(false, refDestructuringErrors, this.parseParenItem));
        }
      }
      var innerEndPos = this.lastTokEnd, innerEndLoc = this.lastTokEndLoc;
      this.expect(types$1.parenR);

      if (canBeArrow && this.shouldParseArrow(exprList) && this.eat(types$1.arrow)) {
        this.checkPatternErrors(refDestructuringErrors, false);
        this.checkYieldAwaitInDefaultParams();
        this.yieldPos = oldYieldPos;
        this.awaitPos = oldAwaitPos;
        return this.parseParenArrowList(startPos, startLoc, exprList, forInit)
      }

      if (!exprList.length || lastIsComma) { this.unexpected(this.lastTokStart); }
      if (spreadStart) { this.unexpected(spreadStart); }
      this.checkExpressionErrors(refDestructuringErrors, true);
      this.yieldPos = oldYieldPos || this.yieldPos;
      this.awaitPos = oldAwaitPos || this.awaitPos;

      if (exprList.length > 1) {
        val = this.startNodeAt(innerStartPos, innerStartLoc);
        val.expressions = exprList;
        this.finishNodeAt(val, "SequenceExpression", innerEndPos, innerEndLoc);
      } else {
        val = exprList[0];
      }
    } else {
      val = this.parseParenExpression();
    }

    if (this.options.preserveParens) {
      var par = this.startNodeAt(startPos, startLoc);
      par.expression = val;
      return this.finishNode(par, "ParenthesizedExpression")
    } else {
      return val
    }
  };

  pp$5.parseParenItem = function(item) {
    return item
  };

  pp$5.parseParenArrowList = function(startPos, startLoc, exprList, forInit) {
    return this.parseArrowExpression(this.startNodeAt(startPos, startLoc), exprList, false, forInit)
  };

  // New's precedence is slightly tricky. It must allow its argument to
  // be a `[]` or dot subscript expression, but not a call — at least,
  // not without wrapping it in parentheses. Thus, it uses the noCalls
  // argument to parseSubscripts to prevent it from consuming the
  // argument list.

  var empty = [];

  pp$5.parseNew = function() {
    if (this.containsEsc) { this.raiseRecoverable(this.start, "Escape sequence in keyword new"); }
    var node = this.startNode();
    this.next();
    if (this.options.ecmaVersion >= 6 && this.type === types$1.dot) {
      var meta = this.startNodeAt(node.start, node.loc && node.loc.start);
      meta.name = "new";
      node.meta = this.finishNode(meta, "Identifier");
      this.next();
      var containsEsc = this.containsEsc;
      node.property = this.parseIdent(true);
      if (node.property.name !== "target")
        { this.raiseRecoverable(node.property.start, "The only valid meta property for new is 'new.target'"); }
      if (containsEsc)
        { this.raiseRecoverable(node.start, "'new.target' must not contain escaped characters"); }
      if (!this.allowNewDotTarget)
        { this.raiseRecoverable(node.start, "'new.target' can only be used in functions and class static block"); }
      return this.finishNode(node, "MetaProperty")
    }
    var startPos = this.start, startLoc = this.startLoc;
    node.callee = this.parseSubscripts(this.parseExprAtom(null, false, true), startPos, startLoc, true, false);
    if (this.eat(types$1.parenL)) { node.arguments = this.parseExprList(types$1.parenR, this.options.ecmaVersion >= 8, false); }
    else { node.arguments = empty; }
    return this.finishNode(node, "NewExpression")
  };

  // Parse template expression.

  pp$5.parseTemplateElement = function(ref) {
    var isTagged = ref.isTagged;

    var elem = this.startNode();
    if (this.type === types$1.invalidTemplate) {
      if (!isTagged) {
        this.raiseRecoverable(this.start, "Bad escape sequence in untagged template literal");
      }
      elem.value = {
        raw: this.value.replace(/\r\n?/g, "\n"),
        cooked: null
      };
    } else {
      elem.value = {
        raw: this.input.slice(this.start, this.end).replace(/\r\n?/g, "\n"),
        cooked: this.value
      };
    }
    this.next();
    elem.tail = this.type === types$1.backQuote;
    return this.finishNode(elem, "TemplateElement")
  };

  pp$5.parseTemplate = function(ref) {
    if ( ref === void 0 ) ref = {};
    var isTagged = ref.isTagged; if ( isTagged === void 0 ) isTagged = false;

    var node = this.startNode();
    this.next();
    node.expressions = [];
    var curElt = this.parseTemplateElement({isTagged: isTagged});
    node.quasis = [curElt];
    while (!curElt.tail) {
      if (this.type === types$1.eof) { this.raise(this.pos, "Unterminated template literal"); }
      this.expect(types$1.dollarBraceL);
      node.expressions.push(this.parseExpression());
      this.expect(types$1.braceR);
      node.quasis.push(curElt = this.parseTemplateElement({isTagged: isTagged}));
    }
    this.next();
    return this.finishNode(node, "TemplateLiteral")
  };

  pp$5.isAsyncProp = function(prop) {
    return !prop.computed && prop.key.type === "Identifier" && prop.key.name === "async" &&
      (this.type === types$1.name || this.type === types$1.num || this.type === types$1.string || this.type === types$1.bracketL || this.type.keyword || (this.options.ecmaVersion >= 9 && this.type === types$1.star)) &&
      !lineBreak.test(this.input.slice(this.lastTokEnd, this.start))
  };

  // Parse an object literal or binding pattern.

  pp$5.parseObj = function(isPattern, refDestructuringErrors) {
    var node = this.startNode(), first = true, propHash = {};
    node.properties = [];
    this.next();
    while (!this.eat(types$1.braceR)) {
      if (!first) {
        this.expect(types$1.comma);
        if (this.options.ecmaVersion >= 5 && this.afterTrailingComma(types$1.braceR)) { break }
      } else { first = false; }

      var prop = this.parseProperty(isPattern, refDestructuringErrors);
      if (!isPattern) { this.checkPropClash(prop, propHash, refDestructuringErrors); }
      node.properties.push(prop);
    }
    return this.finishNode(node, isPattern ? "ObjectPattern" : "ObjectExpression")
  };

  pp$5.parseProperty = function(isPattern, refDestructuringErrors) {
    var prop = this.startNode(), isGenerator, isAsync, startPos, startLoc;
    if (this.options.ecmaVersion >= 9 && this.eat(types$1.ellipsis)) {
      if (isPattern) {
        prop.argument = this.parseIdent(false);
        if (this.type === types$1.comma) {
          this.raiseRecoverable(this.start, "Comma is not permitted after the rest element");
        }
        return this.finishNode(prop, "RestElement")
      }
      // Parse argument.
      prop.argument = this.parseMaybeAssign(false, refDestructuringErrors);
      // To disallow trailing comma via `this.toAssignable()`.
      if (this.type === types$1.comma && refDestructuringErrors && refDestructuringErrors.trailingComma < 0) {
        refDestructuringErrors.trailingComma = this.start;
      }
      // Finish
      return this.finishNode(prop, "SpreadElement")
    }
    if (this.options.ecmaVersion >= 6) {
      prop.method = false;
      prop.shorthand = false;
      if (isPattern || refDestructuringErrors) {
        startPos = this.start;
        startLoc = this.startLoc;
      }
      if (!isPattern)
        { isGenerator = this.eat(types$1.star); }
    }
    var containsEsc = this.containsEsc;
    this.parsePropertyName(prop);
    if (!isPattern && !containsEsc && this.options.ecmaVersion >= 8 && !isGenerator && this.isAsyncProp(prop)) {
      isAsync = true;
      isGenerator = this.options.ecmaVersion >= 9 && this.eat(types$1.star);
      this.parsePropertyName(prop);
    } else {
      isAsync = false;
    }
    this.parsePropertyValue(prop, isPattern, isGenerator, isAsync, startPos, startLoc, refDestructuringErrors, containsEsc);
    return this.finishNode(prop, "Property")
  };

  pp$5.parseGetterSetter = function(prop) {
    var kind = prop.key.name;
    this.parsePropertyName(prop);
    prop.value = this.parseMethod(false);
    prop.kind = kind;
    var paramCount = prop.kind === "get" ? 0 : 1;
    if (prop.value.params.length !== paramCount) {
      var start = prop.value.start;
      if (prop.kind === "get")
        { this.raiseRecoverable(start, "getter should have no params"); }
      else
        { this.raiseRecoverable(start, "setter should have exactly one param"); }
    } else {
      if (prop.kind === "set" && prop.value.params[0].type === "RestElement")
        { this.raiseRecoverable(prop.value.params[0].start, "Setter cannot use rest params"); }
    }
  };

  pp$5.parsePropertyValue = function(prop, isPattern, isGenerator, isAsync, startPos, startLoc, refDestructuringErrors, containsEsc) {
    if ((isGenerator || isAsync) && this.type === types$1.colon)
      { this.unexpected(); }

    if (this.eat(types$1.colon)) {
      prop.value = isPattern ? this.parseMaybeDefault(this.start, this.startLoc) : this.parseMaybeAssign(false, refDestructuringErrors);
      prop.kind = "init";
    } else if (this.options.ecmaVersion >= 6 && this.type === types$1.parenL) {
      if (isPattern) { this.unexpected(); }
      prop.method = true;
      prop.value = this.parseMethod(isGenerator, isAsync);
      prop.kind = "init";
    } else if (!isPattern && !containsEsc &&
               this.options.ecmaVersion >= 5 && !prop.computed && prop.key.type === "Identifier" &&
               (prop.key.name === "get" || prop.key.name === "set") &&
               (this.type !== types$1.comma && this.type !== types$1.braceR && this.type !== types$1.eq)) {
      if (isGenerator || isAsync) { this.unexpected(); }
      this.parseGetterSetter(prop);
    } else if (this.options.ecmaVersion >= 6 && !prop.computed && prop.key.type === "Identifier") {
      if (isGenerator || isAsync) { this.unexpected(); }
      this.checkUnreserved(prop.key);
      if (prop.key.name === "await" && !this.awaitIdentPos)
        { this.awaitIdentPos = startPos; }
      if (isPattern) {
        prop.value = this.parseMaybeDefault(startPos, startLoc, this.copyNode(prop.key));
      } else if (this.type === types$1.eq && refDestructuringErrors) {
        if (refDestructuringErrors.shorthandAssign < 0)
          { refDestructuringErrors.shorthandAssign = this.start; }
        prop.value = this.parseMaybeDefault(startPos, startLoc, this.copyNode(prop.key));
      } else {
        prop.value = this.copyNode(prop.key);
      }
      prop.kind = "init";
      prop.shorthand = true;
    } else { this.unexpected(); }
  };

  pp$5.parsePropertyName = function(prop) {
    if (this.options.ecmaVersion >= 6) {
      if (this.eat(types$1.bracketL)) {
        prop.computed = true;
        prop.key = this.parseMaybeAssign();
        this.expect(types$1.bracketR);
        return prop.key
      } else {
        prop.computed = false;
      }
    }
    return prop.key = this.type === types$1.num || this.type === types$1.string ? this.parseExprAtom() : this.parseIdent(this.options.allowReserved !== "never")
  };

  // Initialize empty function node.

  pp$5.initFunction = function(node) {
    node.id = null;
    if (this.options.ecmaVersion >= 6) { node.generator = node.expression = false; }
    if (this.options.ecmaVersion >= 8) { node.async = false; }
  };

  // Parse object or class method.

  pp$5.parseMethod = function(isGenerator, isAsync, allowDirectSuper) {
    var node = this.startNode(), oldYieldPos = this.yieldPos, oldAwaitPos = this.awaitPos, oldAwaitIdentPos = this.awaitIdentPos;

    this.initFunction(node);
    if (this.options.ecmaVersion >= 6)
      { node.generator = isGenerator; }
    if (this.options.ecmaVersion >= 8)
      { node.async = !!isAsync; }

    this.yieldPos = 0;
    this.awaitPos = 0;
    this.awaitIdentPos = 0;
    this.enterScope(functionFlags(isAsync, node.generator) | SCOPE_SUPER | (allowDirectSuper ? SCOPE_DIRECT_SUPER : 0));

    this.expect(types$1.parenL);
    node.params = this.parseBindingList(types$1.parenR, false, this.options.ecmaVersion >= 8);
    this.checkYieldAwaitInDefaultParams();
    this.parseFunctionBody(node, false, true, false);

    this.yieldPos = oldYieldPos;
    this.awaitPos = oldAwaitPos;
    this.awaitIdentPos = oldAwaitIdentPos;
    return this.finishNode(node, "FunctionExpression")
  };

  // Parse arrow function expression with given parameters.

  pp$5.parseArrowExpression = function(node, params, isAsync, forInit) {
    var oldYieldPos = this.yieldPos, oldAwaitPos = this.awaitPos, oldAwaitIdentPos = this.awaitIdentPos;

    this.enterScope(functionFlags(isAsync, false) | SCOPE_ARROW);
    this.initFunction(node);
    if (this.options.ecmaVersion >= 8) { node.async = !!isAsync; }

    this.yieldPos = 0;
    this.awaitPos = 0;
    this.awaitIdentPos = 0;

    node.params = this.toAssignableList(params, true);
    this.parseFunctionBody(node, true, false, forInit);

    this.yieldPos = oldYieldPos;
    this.awaitPos = oldAwaitPos;
    this.awaitIdentPos = oldAwaitIdentPos;
    return this.finishNode(node, "ArrowFunctionExpression")
  };

  // Parse function body and check parameters.

  pp$5.parseFunctionBody = function(node, isArrowFunction, isMethod, forInit) {
    var isExpression = isArrowFunction && this.type !== types$1.braceL;
    var oldStrict = this.strict, useStrict = false;

    if (isExpression) {
      node.body = this.parseMaybeAssign(forInit);
      node.expression = true;
      this.checkParams(node, false);
    } else {
      var nonSimple = this.options.ecmaVersion >= 7 && !this.isSimpleParamList(node.params);
      if (!oldStrict || nonSimple) {
        useStrict = this.strictDirective(this.end);
        // If this is a strict mode function, verify that argument names
        // are not repeated, and it does not try to bind the words `eval`
        // or `arguments`.
        if (useStrict && nonSimple)
          { this.raiseRecoverable(node.start, "Illegal 'use strict' directive in function with non-simple parameter list"); }
      }
      // Start a new scope with regard to labels and the `inFunction`
      // flag (restore them to their old value afterwards).
      var oldLabels = this.labels;
      this.labels = [];
      if (useStrict) { this.strict = true; }

      // Add the params to varDeclaredNames to ensure that an error is thrown
      // if a let/const declaration in the function clashes with one of the params.
      this.checkParams(node, !oldStrict && !useStrict && !isArrowFunction && !isMethod && this.isSimpleParamList(node.params));
      // Ensure the function name isn't a forbidden identifier in strict mode, e.g. 'eval'
      if (this.strict && node.id) { this.checkLValSimple(node.id, BIND_OUTSIDE); }
      node.body = this.parseBlock(false, undefined, useStrict && !oldStrict);
      node.expression = false;
      this.adaptDirectivePrologue(node.body.body);
      this.labels = oldLabels;
    }
    this.exitScope();
  };

  pp$5.isSimpleParamList = function(params) {
    for (var i = 0, list = params; i < list.length; i += 1)
      {
      var param = list[i];

      if (param.type !== "Identifier") { return false
    } }
    return true
  };

  // Checks function params for various disallowed patterns such as using "eval"
  // or "arguments" and duplicate parameters.

  pp$5.checkParams = function(node, allowDuplicates) {
    var nameHash = Object.create(null);
    for (var i = 0, list = node.params; i < list.length; i += 1)
      {
      var param = list[i];

      this.checkLValInnerPattern(param, BIND_VAR, allowDuplicates ? null : nameHash);
    }
  };

  // Parses a comma-separated list of expressions, and returns them as
  // an array. `close` is the token type that ends the list, and
  // `allowEmpty` can be turned on to allow subsequent commas with
  // nothing in between them to be parsed as `null` (which is needed
  // for array literals).

  pp$5.parseExprList = function(close, allowTrailingComma, allowEmpty, refDestructuringErrors) {
    var elts = [], first = true;
    while (!this.eat(close)) {
      if (!first) {
        this.expect(types$1.comma);
        if (allowTrailingComma && this.afterTrailingComma(close)) { break }
      } else { first = false; }

      var elt = (void 0);
      if (allowEmpty && this.type === types$1.comma)
        { elt = null; }
      else if (this.type === types$1.ellipsis) {
        elt = this.parseSpread(refDestructuringErrors);
        if (refDestructuringErrors && this.type === types$1.comma && refDestructuringErrors.trailingComma < 0)
          { refDestructuringErrors.trailingComma = this.start; }
      } else {
        elt = this.parseMaybeAssign(false, refDestructuringErrors);
      }
      elts.push(elt);
    }
    return elts
  };

  pp$5.checkUnreserved = function(ref) {
    var start = ref.start;
    var end = ref.end;
    var name = ref.name;

    if (this.inGenerator && name === "yield")
      { this.raiseRecoverable(start, "Cannot use 'yield' as identifier inside a generator"); }
    if (this.inAsync && name === "await")
      { this.raiseRecoverable(start, "Cannot use 'await' as identifier inside an async function"); }
    if (!(this.currentThisScope().flags & SCOPE_VAR) && name === "arguments")
      { this.raiseRecoverable(start, "Cannot use 'arguments' in class field initializer"); }
    if (this.inClassStaticBlock && (name === "arguments" || name === "await"))
      { this.raise(start, ("Cannot use " + name + " in class static initialization block")); }
    if (this.keywords.test(name))
      { this.raise(start, ("Unexpected keyword '" + name + "'")); }
    if (this.options.ecmaVersion < 6 &&
      this.input.slice(start, end).indexOf("\\") !== -1) { return }
    var re = this.strict ? this.reservedWordsStrict : this.reservedWords;
    if (re.test(name)) {
      if (!this.inAsync && name === "await")
        { this.raiseRecoverable(start, "Cannot use keyword 'await' outside an async function"); }
      this.raiseRecoverable(start, ("The keyword '" + name + "' is reserved"));
    }
  };

  // Parse the next token as an identifier. If `liberal` is true (used
  // when parsing properties), it will also convert keywords into
  // identifiers.

  pp$5.parseIdent = function(liberal) {
    var node = this.parseIdentNode();
    this.next(!!liberal);
    this.finishNode(node, "Identifier");
    if (!liberal) {
      this.checkUnreserved(node);
      if (node.name === "await" && !this.awaitIdentPos)
        { this.awaitIdentPos = node.start; }
    }
    return node
  };

  pp$5.parseIdentNode = function() {
    var node = this.startNode();
    if (this.type === types$1.name) {
      node.name = this.value;
    } else if (this.type.keyword) {
      node.name = this.type.keyword;

      // To fix https://github.com/acornjs/acorn/issues/575
      // `class` and `function` keywords push new context into this.context.
      // But there is no chance to pop the context if the keyword is consumed as an identifier such as a property name.
      // If the previous token is a dot, this does not apply because the context-managing code already ignored the keyword
      if ((node.name === "class" || node.name === "function") &&
        (this.lastTokEnd !== this.lastTokStart + 1 || this.input.charCodeAt(this.lastTokStart) !== 46)) {
        this.context.pop();
      }
      this.type = types$1.name;
    } else {
      this.unexpected();
    }
    return node
  };

  pp$5.parsePrivateIdent = function() {
    var node = this.startNode();
    if (this.type === types$1.privateId) {
      node.name = this.value;
    } else {
      this.unexpected();
    }
    this.next();
    this.finishNode(node, "PrivateIdentifier");

    // For validating existence
    if (this.options.checkPrivateFields) {
      if (this.privateNameStack.length === 0) {
        this.raise(node.start, ("Private field '#" + (node.name) + "' must be declared in an enclosing class"));
      } else {
        this.privateNameStack[this.privateNameStack.length - 1].used.push(node);
      }
    }

    return node
  };

  // Parses yield expression inside generator.

  pp$5.parseYield = function(forInit) {
    if (!this.yieldPos) { this.yieldPos = this.start; }

    var node = this.startNode();
    this.next();
    if (this.type === types$1.semi || this.canInsertSemicolon() || (this.type !== types$1.star && !this.type.startsExpr)) {
      node.delegate = false;
      node.argument = null;
    } else {
      node.delegate = this.eat(types$1.star);
      node.argument = this.parseMaybeAssign(forInit);
    }
    return this.finishNode(node, "YieldExpression")
  };

  pp$5.parseAwait = function(forInit) {
    if (!this.awaitPos) { this.awaitPos = this.start; }

    var node = this.startNode();
    this.next();
    node.argument = this.parseMaybeUnary(null, true, false, forInit);
    return this.finishNode(node, "AwaitExpression")
  };

  var pp$4 = Parser.prototype;

  // This function is used to raise exceptions on parse errors. It
  // takes an offset integer (into the current `input`) to indicate
  // the location of the error, attaches the position to the end
  // of the error message, and then raises a `SyntaxError` with that
  // message.

  pp$4.raise = function(pos, message) {
    var loc = getLineInfo(this.input, pos);
    message += " (" + loc.line + ":" + loc.column + ")";
    if (this.sourceFile) {
      message += " in " + this.sourceFile;
    }
    var err = new SyntaxError(message);
    err.pos = pos; err.loc = loc; err.raisedAt = this.pos;
    throw err
  };

  pp$4.raiseRecoverable = pp$4.raise;

  pp$4.curPosition = function() {
    if (this.options.locations) {
      return new Position(this.curLine, this.pos - this.lineStart)
    }
  };

  var pp$3 = Parser.prototype;

  var Scope = function Scope(flags) {
    this.flags = flags;
    // A list of var-declared names in the current lexical scope
    this.var = [];
    // A list of lexically-declared names in the current lexical scope
    this.lexical = [];
    // A list of lexically-declared FunctionDeclaration names in the current lexical scope
    this.functions = [];
  };

  // The functions in this module keep track of declared variables in the current scope in order to detect duplicate variable names.

  pp$3.enterScope = function(flags) {
    this.scopeStack.push(new Scope(flags));
  };

  pp$3.exitScope = function() {
    this.scopeStack.pop();
  };

  // The spec says:
  // > At the top level of a function, or script, function declarations are
  // > treated like var declarations rather than like lexical declarations.
  pp$3.treatFunctionsAsVarInScope = function(scope) {
    return (scope.flags & SCOPE_FUNCTION) || !this.inModule && (scope.flags & SCOPE_TOP)
  };

  pp$3.declareName = function(name, bindingType, pos) {
    var redeclared = false;
    if (bindingType === BIND_LEXICAL) {
      var scope = this.currentScope();
      redeclared = scope.lexical.indexOf(name) > -1 || scope.functions.indexOf(name) > -1 || scope.var.indexOf(name) > -1;
      scope.lexical.push(name);
      if (this.inModule && (scope.flags & SCOPE_TOP))
        { delete this.undefinedExports[name]; }
    } else if (bindingType === BIND_SIMPLE_CATCH) {
      var scope$1 = this.currentScope();
      scope$1.lexical.push(name);
    } else if (bindingType === BIND_FUNCTION) {
      var scope$2 = this.currentScope();
      if (this.treatFunctionsAsVar)
        { redeclared = scope$2.lexical.indexOf(name) > -1; }
      else
        { redeclared = scope$2.lexical.indexOf(name) > -1 || scope$2.var.indexOf(name) > -1; }
      scope$2.functions.push(name);
    } else {
      for (var i = this.scopeStack.length - 1; i >= 0; --i) {
        var scope$3 = this.scopeStack[i];
        if (scope$3.lexical.indexOf(name) > -1 && !((scope$3.flags & SCOPE_SIMPLE_CATCH) && scope$3.lexical[0] === name) ||
            !this.treatFunctionsAsVarInScope(scope$3) && scope$3.functions.indexOf(name) > -1) {
          redeclared = true;
          break
        }
        scope$3.var.push(name);
        if (this.inModule && (scope$3.flags & SCOPE_TOP))
          { delete this.undefinedExports[name]; }
        if (scope$3.flags & SCOPE_VAR) { break }
      }
    }
    if (redeclared) { this.raiseRecoverable(pos, ("Identifier '" + name + "' has already been declared")); }
  };

  pp$3.checkLocalExport = function(id) {
    // scope.functions must be empty as Module code is always strict.
    if (this.scopeStack[0].lexical.indexOf(id.name) === -1 &&
        this.scopeStack[0].var.indexOf(id.name) === -1) {
      this.undefinedExports[id.name] = id;
    }
  };

  pp$3.currentScope = function() {
    return this.scopeStack[this.scopeStack.length - 1]
  };

  pp$3.currentVarScope = function() {
    for (var i = this.scopeStack.length - 1;; i--) {
      var scope = this.scopeStack[i];
      if (scope.flags & (SCOPE_VAR | SCOPE_CLASS_FIELD_INIT | SCOPE_CLASS_STATIC_BLOCK)) { return scope }
    }
  };

  // Could be useful for `this`, `new.target`, `super()`, `super.property`, and `super[property]`.
  pp$3.currentThisScope = function() {
    for (var i = this.scopeStack.length - 1;; i--) {
      var scope = this.scopeStack[i];
      if (scope.flags & (SCOPE_VAR | SCOPE_CLASS_FIELD_INIT | SCOPE_CLASS_STATIC_BLOCK) &&
          !(scope.flags & SCOPE_ARROW)) { return scope }
    }
  };

  var Node = function Node(parser, pos, loc) {
    this.type = "";
    this.start = pos;
    this.end = 0;
    if (parser.options.locations)
      { this.loc = new SourceLocation(parser, loc); }
    if (parser.options.directSourceFile)
      { this.sourceFile = parser.options.directSourceFile; }
    if (parser.options.ranges)
      { this.range = [pos, 0]; }
  };

  // Start an AST node, attaching a start offset.

  var pp$2 = Parser.prototype;

  pp$2.startNode = function() {
    return new Node(this, this.start, this.startLoc)
  };

  pp$2.startNodeAt = function(pos, loc) {
    return new Node(this, pos, loc)
  };

  // Finish an AST node, adding `type` and `end` properties.

  function finishNodeAt(node, type, pos, loc) {
    node.type = type;
    node.end = pos;
    if (this.options.locations)
      { node.loc.end = loc; }
    if (this.options.ranges)
      { node.range[1] = pos; }
    return node
  }

  pp$2.finishNode = function(node, type) {
    return finishNodeAt.call(this, node, type, this.lastTokEnd, this.lastTokEndLoc)
  };

  // Finish node at given position

  pp$2.finishNodeAt = function(node, type, pos, loc) {
    return finishNodeAt.call(this, node, type, pos, loc)
  };

  pp$2.copyNode = function(node) {
    var newNode = new Node(this, node.start, this.startLoc);
    for (var prop in node) { newNode[prop] = node[prop]; }
    return newNode
  };

  // This file was generated by "bin/generate-unicode-script-values.js". Do not modify manually!
  var scriptValuesAddedInUnicode = "Berf Beria_Erfe Gara Garay Gukh Gurung_Khema Hrkt Katakana_Or_Hiragana Kawi Kirat_Rai Krai Nag_Mundari Nagm Ol_Onal Onao Sidetic Sidt Sunu Sunuwar Tai_Yo Tayo Todhri Todr Tolong_Siki Tols Tulu_Tigalari Tutg Unknown Zzzz";

  // This file contains Unicode properties extracted from the ECMAScript specification.
  // The lists are extracted like so:
  // $$('#table-binary-unicode-properties > figure > table > tbody > tr > td:nth-child(1) code').map(el => el.innerText)

  // #table-binary-unicode-properties
  var ecma9BinaryProperties = "ASCII ASCII_Hex_Digit AHex Alphabetic Alpha Any Assigned Bidi_Control Bidi_C Bidi_Mirrored Bidi_M Case_Ignorable CI Cased Changes_When_Casefolded CWCF Changes_When_Casemapped CWCM Changes_When_Lowercased CWL Changes_When_NFKC_Casefolded CWKCF Changes_When_Titlecased CWT Changes_When_Uppercased CWU Dash Default_Ignorable_Code_Point DI Deprecated Dep Diacritic Dia Emoji Emoji_Component Emoji_Modifier Emoji_Modifier_Base Emoji_Presentation Extender Ext Grapheme_Base Gr_Base Grapheme_Extend Gr_Ext Hex_Digit Hex IDS_Binary_Operator IDSB IDS_Trinary_Operator IDST ID_Continue IDC ID_Start IDS Ideographic Ideo Join_Control Join_C Logical_Order_Exception LOE Lowercase Lower Math Noncharacter_Code_Point NChar Pattern_Syntax Pat_Syn Pattern_White_Space Pat_WS Quotation_Mark QMark Radical Regional_Indicator RI Sentence_Terminal STerm Soft_Dotted SD Terminal_Punctuation Term Unified_Ideograph UIdeo Uppercase Upper Variation_Selector VS White_Space space XID_Continue XIDC XID_Start XIDS";
  var ecma10BinaryProperties = ecma9BinaryProperties + " Extended_Pictographic";
  var ecma11BinaryProperties = ecma10BinaryProperties;
  var ecma12BinaryProperties = ecma11BinaryProperties + " EBase EComp EMod EPres ExtPict";
  var ecma13BinaryProperties = ecma12BinaryProperties;
  var ecma14BinaryProperties = ecma13BinaryProperties;

  var unicodeBinaryProperties = {
    9: ecma9BinaryProperties,
    10: ecma10BinaryProperties,
    11: ecma11BinaryProperties,
    12: ecma12BinaryProperties,
    13: ecma13BinaryProperties,
    14: ecma14BinaryProperties
  };

  // #table-binary-unicode-properties-of-strings
  var ecma14BinaryPropertiesOfStrings = "Basic_Emoji Emoji_Keycap_Sequence RGI_Emoji_Modifier_Sequence RGI_Emoji_Flag_Sequence RGI_Emoji_Tag_Sequence RGI_Emoji_ZWJ_Sequence RGI_Emoji";

  var unicodeBinaryPropertiesOfStrings = {
    9: "",
    10: "",
    11: "",
    12: "",
    13: "",
    14: ecma14BinaryPropertiesOfStrings
  };

  // #table-unicode-general-category-values
  var unicodeGeneralCategoryValues = "Cased_Letter LC Close_Punctuation Pe Connector_Punctuation Pc Control Cc cntrl Currency_Symbol Sc Dash_Punctuation Pd Decimal_Number Nd digit Enclosing_Mark Me Final_Punctuation Pf Format Cf Initial_Punctuation Pi Letter L Letter_Number Nl Line_Separator Zl Lowercase_Letter Ll Mark M Combining_Mark Math_Symbol Sm Modifier_Letter Lm Modifier_Symbol Sk Nonspacing_Mark Mn Number N Open_Punctuation Ps Other C Other_Letter Lo Other_Number No Other_Punctuation Po Other_Symbol So Paragraph_Separator Zp Private_Use Co Punctuation P punct Separator Z Space_Separator Zs Spacing_Mark Mc Surrogate Cs Symbol S Titlecase_Letter Lt Unassigned Cn Uppercase_Letter Lu";

  // #table-unicode-script-values
  var ecma9ScriptValues = "Adlam Adlm Ahom Anatolian_Hieroglyphs Hluw Arabic Arab Armenian Armn Avestan Avst Balinese Bali Bamum Bamu Bassa_Vah Bass Batak Batk Bengali Beng Bhaiksuki Bhks Bopomofo Bopo Brahmi Brah Braille Brai Buginese Bugi Buhid Buhd Canadian_Aboriginal Cans Carian Cari Caucasian_Albanian Aghb Chakma Cakm Cham Cham Cherokee Cher Common Zyyy Coptic Copt Qaac Cuneiform Xsux Cypriot Cprt Cyrillic Cyrl Deseret Dsrt Devanagari Deva Duployan Dupl Egyptian_Hieroglyphs Egyp Elbasan Elba Ethiopic Ethi Georgian Geor Glagolitic Glag Gothic Goth Grantha Gran Greek Grek Gujarati Gujr Gurmukhi Guru Han Hani Hangul Hang Hanunoo Hano Hatran Hatr Hebrew Hebr Hiragana Hira Imperial_Aramaic Armi Inherited Zinh Qaai Inscriptional_Pahlavi Phli Inscriptional_Parthian Prti Javanese Java Kaithi Kthi Kannada Knda Katakana Kana Kayah_Li Kali Kharoshthi Khar Khmer Khmr Khojki Khoj Khudawadi Sind Lao Laoo Latin Latn Lepcha Lepc Limbu Limb Linear_A Lina Linear_B Linb Lisu Lisu Lycian Lyci Lydian Lydi Mahajani Mahj Malayalam Mlym Mandaic Mand Manichaean Mani Marchen Marc Masaram_Gondi Gonm Meetei_Mayek Mtei Mende_Kikakui Mend Meroitic_Cursive Merc Meroitic_Hieroglyphs Mero Miao Plrd Modi Mongolian Mong Mro Mroo Multani Mult Myanmar Mymr Nabataean Nbat New_Tai_Lue Talu Newa Newa Nko Nkoo Nushu Nshu Ogham Ogam Ol_Chiki Olck Old_Hungarian Hung Old_Italic Ital Old_North_Arabian Narb Old_Permic Perm Old_Persian Xpeo Old_South_Arabian Sarb Old_Turkic Orkh Oriya Orya Osage Osge Osmanya Osma Pahawh_Hmong Hmng Palmyrene Palm Pau_Cin_Hau Pauc Phags_Pa Phag Phoenician Phnx Psalter_Pahlavi Phlp Rejang Rjng Runic Runr Samaritan Samr Saurashtra Saur Sharada Shrd Shavian Shaw Siddham Sidd SignWriting Sgnw Sinhala Sinh Sora_Sompeng Sora Soyombo Soyo Sundanese Sund Syloti_Nagri Sylo Syriac Syrc Tagalog Tglg Tagbanwa Tagb Tai_Le Tale Tai_Tham Lana Tai_Viet Tavt Takri Takr Tamil Taml Tangut Tang Telugu Telu Thaana Thaa Thai Thai Tibetan Tibt Tifinagh Tfng Tirhuta Tirh Ugaritic Ugar Vai Vaii Warang_Citi Wara Yi Yiii Zanabazar_Square Zanb";
  var ecma10ScriptValues = ecma9ScriptValues + " Dogra Dogr Gunjala_Gondi Gong Hanifi_Rohingya Rohg Makasar Maka Medefaidrin Medf Old_Sogdian Sogo Sogdian Sogd";
  var ecma11ScriptValues = ecma10ScriptValues + " Elymaic Elym Nandinagari Nand Nyiakeng_Puachue_Hmong Hmnp Wancho Wcho";
  var ecma12ScriptValues = ecma11ScriptValues + " Chorasmian Chrs Diak Dives_Akuru Khitan_Small_Script Kits Yezi Yezidi";
  var ecma13ScriptValues = ecma12ScriptValues + " Cypro_Minoan Cpmn Old_Uyghur Ougr Tangsa Tnsa Toto Vithkuqi Vith";
  var ecma14ScriptValues = ecma13ScriptValues + " " + scriptValuesAddedInUnicode;

  var unicodeScriptValues = {
    9: ecma9ScriptValues,
    10: ecma10ScriptValues,
    11: ecma11ScriptValues,
    12: ecma12ScriptValues,
    13: ecma13ScriptValues,
    14: ecma14ScriptValues
  };

  var data = {};
  function buildUnicodeData(ecmaVersion) {
    var d = data[ecmaVersion] = {
      binary: wordsRegexp(unicodeBinaryProperties[ecmaVersion] + " " + unicodeGeneralCategoryValues),
      binaryOfStrings: wordsRegexp(unicodeBinaryPropertiesOfStrings[ecmaVersion]),
      nonBinary: {
        General_Category: wordsRegexp(unicodeGeneralCategoryValues),
        Script: wordsRegexp(unicodeScriptValues[ecmaVersion])
      }
    };
    d.nonBinary.Script_Extensions = d.nonBinary.Script;

    d.nonBinary.gc = d.nonBinary.General_Category;
    d.nonBinary.sc = d.nonBinary.Script;
    d.nonBinary.scx = d.nonBinary.Script_Extensions;
  }

  for (var i = 0, list = [9, 10, 11, 12, 13, 14]; i < list.length; i += 1) {
    var ecmaVersion = list[i];

    buildUnicodeData(ecmaVersion);
  }

  var pp$1 = Parser.prototype;

  // Track disjunction structure to determine whether a duplicate
  // capture group name is allowed because it is in a separate branch.
  var BranchID = function BranchID(parent, base) {
    // Parent disjunction branch
    this.parent = parent;
    // Identifies this set of sibling branches
    this.base = base || this;
  };

  BranchID.prototype.separatedFrom = function separatedFrom (alt) {
    // A branch is separate from another branch if they or any of
    // their parents are siblings in a given disjunction
    for (var self = this; self; self = self.parent) {
      for (var other = alt; other; other = other.parent) {
        if (self.base === other.base && self !== other) { return true }
      }
    }
    return false
  };

  BranchID.prototype.sibling = function sibling () {
    return new BranchID(this.parent, this.base)
  };

  var RegExpValidationState = function RegExpValidationState(parser) {
    this.parser = parser;
    this.validFlags = "gim" + (parser.options.ecmaVersion >= 6 ? "uy" : "") + (parser.options.ecmaVersion >= 9 ? "s" : "") + (parser.options.ecmaVersion >= 13 ? "d" : "") + (parser.options.ecmaVersion >= 15 ? "v" : "");
    this.unicodeProperties = data[parser.options.ecmaVersion >= 14 ? 14 : parser.options.ecmaVersion];
    this.source = "";
    this.flags = "";
    this.start = 0;
    this.switchU = false;
    this.switchV = false;
    this.switchN = false;
    this.pos = 0;
    this.lastIntValue = 0;
    this.lastStringValue = "";
    this.lastAssertionIsQuantifiable = false;
    this.numCapturingParens = 0;
    this.maxBackReference = 0;
    this.groupNames = Object.create(null);
    this.backReferenceNames = [];
    this.branchID = null;
  };

  RegExpValidationState.prototype.reset = function reset (start, pattern, flags) {
    var unicodeSets = flags.indexOf("v") !== -1;
    var unicode = flags.indexOf("u") !== -1;
    this.start = start | 0;
    this.source = pattern + "";
    this.flags = flags;
    if (unicodeSets && this.parser.options.ecmaVersion >= 15) {
      this.switchU = true;
      this.switchV = true;
      this.switchN = true;
    } else {
      this.switchU = unicode && this.parser.options.ecmaVersion >= 6;
      this.switchV = false;
      this.switchN = unicode && this.parser.options.ecmaVersion >= 9;
    }
  };

  RegExpValidationState.prototype.raise = function raise (message) {
    this.parser.raiseRecoverable(this.start, ("Invalid regular expression: /" + (this.source) + "/: " + message));
  };

  // If u flag is given, this returns the code point at the index (it combines a surrogate pair).
  // Otherwise, this returns the code unit of the index (can be a part of a surrogate pair).
  RegExpValidationState.prototype.at = function at (i, forceU) {
      if ( forceU === void 0 ) forceU = false;

    var s = this.source;
    var l = s.length;
    if (i >= l) {
      return -1
    }
    var c = s.charCodeAt(i);
    if (!(forceU || this.switchU) || c <= 0xD7FF || c >= 0xE000 || i + 1 >= l) {
      return c
    }
    var next = s.charCodeAt(i + 1);
    return next >= 0xDC00 && next <= 0xDFFF ? (c << 10) + next - 0x35FDC00 : c
  };

  RegExpValidationState.prototype.nextIndex = function nextIndex (i, forceU) {
      if ( forceU === void 0 ) forceU = false;

    var s = this.source;
    var l = s.length;
    if (i >= l) {
      return l
    }
    var c = s.charCodeAt(i), next;
    if (!(forceU || this.switchU) || c <= 0xD7FF || c >= 0xE000 || i + 1 >= l ||
        (next = s.charCodeAt(i + 1)) < 0xDC00 || next > 0xDFFF) {
      return i + 1
    }
    return i + 2
  };

  RegExpValidationState.prototype.current = function current (forceU) {
      if ( forceU === void 0 ) forceU = false;

    return this.at(this.pos, forceU)
  };

  RegExpValidationState.prototype.lookahead = function lookahead (forceU) {
      if ( forceU === void 0 ) forceU = false;

    return this.at(this.nextIndex(this.pos, forceU), forceU)
  };

  RegExpValidationState.prototype.advance = function advance (forceU) {
      if ( forceU === void 0 ) forceU = false;

    this.pos = this.nextIndex(this.pos, forceU);
  };

  RegExpValidationState.prototype.eat = function eat (ch, forceU) {
      if ( forceU === void 0 ) forceU = false;

    if (this.current(forceU) === ch) {
      this.advance(forceU);
      return true
    }
    return false
  };

  RegExpValidationState.prototype.eatChars = function eatChars (chs, forceU) {
      if ( forceU === void 0 ) forceU = false;

    var pos = this.pos;
    for (var i = 0, list = chs; i < list.length; i += 1) {
      var ch = list[i];

        var current = this.at(pos, forceU);
      if (current === -1 || current !== ch) {
        return false
      }
      pos = this.nextIndex(pos, forceU);
    }
    this.pos = pos;
    return true
  };

  /**
   * Validate the flags part of a given RegExpLiteral.
   *
   * @param {RegExpValidationState} state The state to validate RegExp.
   * @returns {void}
   */
  pp$1.validateRegExpFlags = function(state) {
    var validFlags = state.validFlags;
    var flags = state.flags;

    var u = false;
    var v = false;

    for (var i = 0; i < flags.length; i++) {
      var flag = flags.charAt(i);
      if (validFlags.indexOf(flag) === -1) {
        this.raise(state.start, "Invalid regular expression flag");
      }
      if (flags.indexOf(flag, i + 1) > -1) {
        this.raise(state.start, "Duplicate regular expression flag");
      }
      if (flag === "u") { u = true; }
      if (flag === "v") { v = true; }
    }
    if (this.options.ecmaVersion >= 15 && u && v) {
      this.raise(state.start, "Invalid regular expression flag");
    }
  };

  function hasProp(obj) {
    for (var _ in obj) { return true }
    return false
  }

  /**
   * Validate the pattern part of a given RegExpLiteral.
   *
   * @param {RegExpValidationState} state The state to validate RegExp.
   * @returns {void}
   */
  pp$1.validateRegExpPattern = function(state) {
    this.regexp_pattern(state);

    // The goal symbol for the parse is |Pattern[~U, ~N]|. If the result of
    // parsing contains a |GroupName|, reparse with the goal symbol
    // |Pattern[~U, +N]| and use this result instead. Throw a *SyntaxError*
    // exception if _P_ did not conform to the grammar, if any elements of _P_
    // were not matched by the parse, or if any Early Error conditions exist.
    if (!state.switchN && this.options.ecmaVersion >= 9 && hasProp(state.groupNames)) {
      state.switchN = true;
      this.regexp_pattern(state);
    }
  };

  // https://www.ecma-international.org/ecma-262/8.0/#prod-Pattern
  pp$1.regexp_pattern = function(state) {
    state.pos = 0;
    state.lastIntValue = 0;
    state.lastStringValue = "";
    state.lastAssertionIsQuantifiable = false;
    state.numCapturingParens = 0;
    state.maxBackReference = 0;
    state.groupNames = Object.create(null);
    state.backReferenceNames.length = 0;
    state.branchID = null;

    this.regexp_disjunction(state);

    if (state.pos !== state.source.length) {
      // Make the same messages as V8.
      if (state.eat(0x29 /* ) */)) {
        state.raise("Unmatched ')'");
      }
      if (state.eat(0x5D /* ] */) || state.eat(0x7D /* } */)) {
        state.raise("Lone quantifier brackets");
      }
    }
    if (state.maxBackReference > state.numCapturingParens) {
      state.raise("Invalid escape");
    }
    for (var i = 0, list = state.backReferenceNames; i < list.length; i += 1) {
      var name = list[i];

      if (!state.groupNames[name]) {
        state.raise("Invalid named capture referenced");
      }
    }
  };

  // https://www.ecma-international.org/ecma-262/8.0/#prod-Disjunction
  pp$1.regexp_disjunction = function(state) {
    var trackDisjunction = this.options.ecmaVersion >= 16;
    if (trackDisjunction) { state.branchID = new BranchID(state.branchID, null); }
    this.regexp_alternative(state);
    while (state.eat(0x7C /* | */)) {
      if (trackDisjunction) { state.branchID = state.branchID.sibling(); }
      this.regexp_alternative(state);
    }
    if (trackDisjunction) { state.branchID = state.branchID.parent; }

    // Make the same message as V8.
    if (this.regexp_eatQuantifier(state, true)) {
      state.raise("Nothing to repeat");
    }
    if (state.eat(0x7B /* { */)) {
      state.raise("Lone quantifier brackets");
    }
  };

  // https://www.ecma-international.org/ecma-262/8.0/#prod-Alternative
  pp$1.regexp_alternative = function(state) {
    while (state.pos < state.source.length && this.regexp_eatTerm(state)) {}
  };

  // https://www.ecma-international.org/ecma-262/8.0/#prod-annexB-Term
  pp$1.regexp_eatTerm = function(state) {
    if (this.regexp_eatAssertion(state)) {
      // Handle `QuantifiableAssertion Quantifier` alternative.
      // `state.lastAssertionIsQuantifiable` is true if the last eaten Assertion
      // is a QuantifiableAssertion.
      if (state.lastAssertionIsQuantifiable && this.regexp_eatQuantifier(state)) {
        // Make the same message as V8.
        if (state.switchU) {
          state.raise("Invalid quantifier");
        }
      }
      return true
    }

    if (state.switchU ? this.regexp_eatAtom(state) : this.regexp_eatExtendedAtom(state)) {
      this.regexp_eatQuantifier(state);
      return true
    }

    return false
  };

  // https://www.ecma-international.org/ecma-262/8.0/#prod-annexB-Assertion
  pp$1.regexp_eatAssertion = function(state) {
    var start = state.pos;
    state.lastAssertionIsQuantifiable = false;

    // ^, $
    if (state.eat(0x5E /* ^ */) || state.eat(0x24 /* $ */)) {
      return true
    }

    // \b \B
    if (state.eat(0x5C /* \ */)) {
      if (state.eat(0x42 /* B */) || state.eat(0x62 /* b */)) {
        return true
      }
      state.pos = start;
    }

    // Lookahead / Lookbehind
    if (state.eat(0x28 /* ( */) && state.eat(0x3F /* ? */)) {
      var lookbehind = false;
      if (this.options.ecmaVersion >= 9) {
        lookbehind = state.eat(0x3C /* < */);
      }
      if (state.eat(0x3D /* = */) || state.eat(0x21 /* ! */)) {
        this.regexp_disjunction(state);
        if (!state.eat(0x29 /* ) */)) {
          state.raise("Unterminated group");
        }
        state.lastAssertionIsQuantifiable = !lookbehind;
        return true
      }
    }

    state.pos = start;
    return false
  };

  // https://www.ecma-international.org/ecma-262/8.0/#prod-Quantifier
  pp$1.regexp_eatQuantifier = function(state, noError) {
    if ( noError === void 0 ) noError = false;

    if (this.regexp_eatQuantifierPrefix(state, noError)) {
      state.eat(0x3F /* ? */);
      return true
    }
    return false
  };

  // https://www.ecma-international.org/ecma-262/8.0/#prod-QuantifierPrefix
  pp$1.regexp_eatQuantifierPrefix = function(state, noError) {
    return (
      state.eat(0x2A /* * */) ||
      state.eat(0x2B /* + */) ||
      state.eat(0x3F /* ? */) ||
      this.regexp_eatBracedQuantifier(state, noError)
    )
  };
  pp$1.regexp_eatBracedQuantifier = function(state, noError) {
    var start = state.pos;
    if (state.eat(0x7B /* { */)) {
      var min = 0, max = -1;
      if (this.regexp_eatDecimalDigits(state)) {
        min = state.lastIntValue;
        if (state.eat(0x2C /* , */) && this.regexp_eatDecimalDigits(state)) {
          max = state.lastIntValue;
        }
        if (state.eat(0x7D /* } */)) {
          // SyntaxError in https://www.ecma-international.org/ecma-262/8.0/#sec-term
          if (max !== -1 && max < min && !noError) {
            state.raise("numbers out of order in {} quantifier");
          }
          return true
        }
      }
      if (state.switchU && !noError) {
        state.raise("Incomplete quantifier");
      }
      state.pos = start;
    }
    return false
  };

  // https://www.ecma-international.org/ecma-262/8.0/#prod-Atom
  pp$1.regexp_eatAtom = function(state) {
    return (
      this.regexp_eatPatternCharacters(state) ||
      state.eat(0x2E /* . */) ||
      this.regexp_eatReverseSolidusAtomEscape(state) ||
      this.regexp_eatCharacterClass(state) ||
      this.regexp_eatUncapturingGroup(state) ||
      this.regexp_eatCapturingGroup(state)
    )
  };
  pp$1.regexp_eatReverseSolidusAtomEscape = function(state) {
    var start = state.pos;
    if (state.eat(0x5C /* \ */)) {
      if (this.regexp_eatAtomEscape(state)) {
        return true
      }
      state.pos = start;
    }
    return false
  };
  pp$1.regexp_eatUncapturingGroup = function(state) {
    var start = state.pos;
    if (state.eat(0x28 /* ( */)) {
      if (state.eat(0x3F /* ? */)) {
        if (this.options.ecmaVersion >= 16) {
          var addModifiers = this.regexp_eatModifiers(state);
          var hasHyphen = state.eat(0x2D /* - */);
          if (addModifiers || hasHyphen) {
            for (var i = 0; i < addModifiers.length; i++) {
              var modifier = addModifiers.charAt(i);
              if (addModifiers.indexOf(modifier, i + 1) > -1) {
                state.raise("Duplicate regular expression modifiers");
              }
            }
            if (hasHyphen) {
              var removeModifiers = this.regexp_eatModifiers(state);
              if (!addModifiers && !removeModifiers && state.current() === 0x3A /* : */) {
                state.raise("Invalid regular expression modifiers");
              }
              for (var i$1 = 0; i$1 < removeModifiers.length; i$1++) {
                var modifier$1 = removeModifiers.charAt(i$1);
                if (
                  removeModifiers.indexOf(modifier$1, i$1 + 1) > -1 ||
                  addModifiers.indexOf(modifier$1) > -1
                ) {
                  state.raise("Duplicate regular expression modifiers");
                }
              }
            }
          }
        }
        if (state.eat(0x3A /* : */)) {
          this.regexp_disjunction(state);
          if (state.eat(0x29 /* ) */)) {
            return true
          }
          state.raise("Unterminated group");
        }
      }
      state.pos = start;
    }
    return false
  };
  pp$1.regexp_eatCapturingGroup = function(state) {
    if (state.eat(0x28 /* ( */)) {
      if (this.options.ecmaVersion >= 9) {
        this.regexp_groupSpecifier(state);
      } else if (state.current() === 0x3F /* ? */) {
        state.raise("Invalid group");
      }
      this.regexp_disjunction(state);
      if (state.eat(0x29 /* ) */)) {
        state.numCapturingParens += 1;
        return true
      }
      state.raise("Unterminated group");
    }
    return false
  };
  // RegularExpressionModifiers ::
  //   [empty]
  //   RegularExpressionModifiers RegularExpressionModifier
  pp$1.regexp_eatModifiers = function(state) {
    var modifiers = "";
    var ch = 0;
    while ((ch = state.current()) !== -1 && isRegularExpressionModifier(ch)) {
      modifiers += codePointToString(ch);
      state.advance();
    }
    return modifiers
  };
  // RegularExpressionModifier :: one of
  //   `i` `m` `s`
  function isRegularExpressionModifier(ch) {
    return ch === 0x69 /* i */ || ch === 0x6d /* m */ || ch === 0x73 /* s */
  }

  // https://www.ecma-international.org/ecma-262/8.0/#prod-annexB-ExtendedAtom
  pp$1.regexp_eatExtendedAtom = function(state) {
    return (
      state.eat(0x2E /* . */) ||
      this.regexp_eatReverseSolidusAtomEscape(state) ||
      this.regexp_eatCharacterClass(state) ||
      this.regexp_eatUncapturingGroup(state) ||
      this.regexp_eatCapturingGroup(state) ||
      this.regexp_eatInvalidBracedQuantifier(state) ||
      this.regexp_eatExtendedPatternCharacter(state)
    )
  };

  // https://www.ecma-international.org/ecma-262/8.0/#prod-annexB-InvalidBracedQuantifier
  pp$1.regexp_eatInvalidBracedQuantifier = function(state) {
    if (this.regexp_eatBracedQuantifier(state, true)) {
      state.raise("Nothing to repeat");
    }
    return false
  };

  // https://www.ecma-international.org/ecma-262/8.0/#prod-SyntaxCharacter
  pp$1.regexp_eatSyntaxCharacter = function(state) {
    var ch = state.current();
    if (isSyntaxCharacter(ch)) {
      state.lastIntValue = ch;
      state.advance();
      return true
    }
    return false
  };
  function isSyntaxCharacter(ch) {
    return (
      ch === 0x24 /* $ */ ||
      ch >= 0x28 /* ( */ && ch <= 0x2B /* + */ ||
      ch === 0x2E /* . */ ||
      ch === 0x3F /* ? */ ||
      ch >= 0x5B /* [ */ && ch <= 0x5E /* ^ */ ||
      ch >= 0x7B /* { */ && ch <= 0x7D /* } */
    )
  }

  // https://www.ecma-international.org/ecma-262/8.0/#prod-PatternCharacter
  // But eat eager.
  pp$1.regexp_eatPatternCharacters = function(state) {
    var start = state.pos;
    var ch = 0;
    while ((ch = state.current()) !== -1 && !isSyntaxCharacter(ch)) {
      state.advance();
    }
    return state.pos !== start
  };

  // https://www.ecma-international.org/ecma-262/8.0/#prod-annexB-ExtendedPatternCharacter
  pp$1.regexp_eatExtendedPatternCharacter = function(state) {
    var ch = state.current();
    if (
      ch !== -1 &&
      ch !== 0x24 /* $ */ &&
      !(ch >= 0x28 /* ( */ && ch <= 0x2B /* + */) &&
      ch !== 0x2E /* . */ &&
      ch !== 0x3F /* ? */ &&
      ch !== 0x5B /* [ */ &&
      ch !== 0x5E /* ^ */ &&
      ch !== 0x7C /* | */
    ) {
      state.advance();
      return true
    }
    return false
  };

  // GroupSpecifier ::
  //   [empty]
  //   `?` GroupName
  pp$1.regexp_groupSpecifier = function(state) {
    if (state.eat(0x3F /* ? */)) {
      if (!this.regexp_eatGroupName(state)) { state.raise("Invalid group"); }
      var trackDisjunction = this.options.ecmaVersion >= 16;
      var known = state.groupNames[state.lastStringValue];
      if (known) {
        if (trackDisjunction) {
          for (var i = 0, list = known; i < list.length; i += 1) {
            var altID = list[i];

            if (!altID.separatedFrom(state.branchID))
              { state.raise("Duplicate capture group name"); }
          }
        } else {
          state.raise("Duplicate capture group name");
        }
      }
      if (trackDisjunction) {
        (known || (state.groupNames[state.lastStringValue] = [])).push(state.branchID);
      } else {
        state.groupNames[state.lastStringValue] = true;
      }
    }
  };

  // GroupName ::
  //   `<` RegExpIdentifierName `>`
  // Note: this updates `state.lastStringValue` property with the eaten name.
  pp$1.regexp_eatGroupName = function(state) {
    state.lastStringValue = "";
    if (state.eat(0x3C /* < */)) {
      if (this.regexp_eatRegExpIdentifierName(state) && state.eat(0x3E /* > */)) {
        return true
      }
      state.raise("Invalid capture group name");
    }
    return false
  };

  // RegExpIdentifierName ::
  //   RegExpIdentifierStart
  //   RegExpIdentifierName RegExpIdentifierPart
  // Note: this updates `state.lastStringValue` property with the eaten name.
  pp$1.regexp_eatRegExpIdentifierName = function(state) {
    state.lastStringValue = "";
    if (this.regexp_eatRegExpIdentifierStart(state)) {
      state.lastStringValue += codePointToString(state.lastIntValue);
      while (this.regexp_eatRegExpIdentifierPart(state)) {
        state.lastStringValue += codePointToString(state.lastIntValue);
      }
      return true
    }
    return false
  };

  // RegExpIdentifierStart ::
  //   UnicodeIDStart
  //   `$`
  //   `_`
  //   `\` RegExpUnicodeEscapeSequence[+U]
  pp$1.regexp_eatRegExpIdentifierStart = function(state) {
    var start = state.pos;
    var forceU = this.options.ecmaVersion >= 11;
    var ch = state.current(forceU);
    state.advance(forceU);

    if (ch === 0x5C /* \ */ && this.regexp_eatRegExpUnicodeEscapeSequence(state, forceU)) {
      ch = state.lastIntValue;
    }
    if (isRegExpIdentifierStart(ch)) {
      state.lastIntValue = ch;
      return true
    }

    state.pos = start;
    return false
  };
  function isRegExpIdentifierStart(ch) {
    return isIdentifierStart(ch, true) || ch === 0x24 /* $ */ || ch === 0x5F /* _ */
  }

  // RegExpIdentifierPart ::
  //   UnicodeIDContinue
  //   `$`
  //   `_`
  //   `\` RegExpUnicodeEscapeSequence[+U]
  //   <ZWNJ>
  //   <ZWJ>
  pp$1.regexp_eatRegExpIdentifierPart = function(state) {
    var start = state.pos;
    var forceU = this.options.ecmaVersion >= 11;
    var ch = state.current(forceU);
    state.advance(forceU);

    if (ch === 0x5C /* \ */ && this.regexp_eatRegExpUnicodeEscapeSequence(state, forceU)) {
      ch = state.lastIntValue;
    }
    if (isRegExpIdentifierPart(ch)) {
      state.lastIntValue = ch;
      return true
    }

    state.pos = start;
    return false
  };
  function isRegExpIdentifierPart(ch) {
    return isIdentifierChar(ch, true) || ch === 0x24 /* $ */ || ch === 0x5F /* _ */ || ch === 0x200C /* <ZWNJ> */ || ch === 0x200D /* <ZWJ> */
  }

  // https://www.ecma-international.org/ecma-262/8.0/#prod-annexB-AtomEscape
  pp$1.regexp_eatAtomEscape = function(state) {
    if (
      this.regexp_eatBackReference(state) ||
      this.regexp_eatCharacterClassEscape(state) ||
      this.regexp_eatCharacterEscape(state) ||
      (state.switchN && this.regexp_eatKGroupName(state))
    ) {
      return true
    }
    if (state.switchU) {
      // Make the same message as V8.
      if (state.current() === 0x63 /* c */) {
        state.raise("Invalid unicode escape");
      }
      state.raise("Invalid escape");
    }
    return false
  };
  pp$1.regexp_eatBackReference = function(state) {
    var start = state.pos;
    if (this.regexp_eatDecimalEscape(state)) {
      var n = state.lastIntValue;
      if (state.switchU) {
        // For SyntaxError in https://www.ecma-international.org/ecma-262/8.0/#sec-atomescape
        if (n > state.maxBackReference) {
          state.maxBackReference = n;
        }
        return true
      }
      if (n <= state.numCapturingParens) {
        return true
      }
      state.pos = start;
    }
    return false
  };
  pp$1.regexp_eatKGroupName = function(state) {
    if (state.eat(0x6B /* k */)) {
      if (this.regexp_eatGroupName(state)) {
        state.backReferenceNames.push(state.lastStringValue);
        return true
      }
      state.raise("Invalid named reference");
    }
    return false
  };

  // https://www.ecma-international.org/ecma-262/8.0/#prod-annexB-CharacterEscape
  pp$1.regexp_eatCharacterEscape = function(state) {
    return (
      this.regexp_eatControlEscape(state) ||
      this.regexp_eatCControlLetter(state) ||
      this.regexp_eatZero(state) ||
      this.regexp_eatHexEscapeSequence(state) ||
      this.regexp_eatRegExpUnicodeEscapeSequence(state, false) ||
      (!state.switchU && this.regexp_eatLegacyOctalEscapeSequence(state)) ||
      this.regexp_eatIdentityEscape(state)
    )
  };
  pp$1.regexp_eatCControlLetter = function(state) {
    var start = state.pos;
    if (state.eat(0x63 /* c */)) {
      if (this.regexp_eatControlLetter(state)) {
        return true
      }
      state.pos = start;
    }
    return false
  };
  pp$1.regexp_eatZero = function(state) {
    if (state.current() === 0x30 /* 0 */ && !isDecimalDigit(state.lookahead())) {
      state.lastIntValue = 0;
      state.advance();
      return true
    }
    return false
  };

  // https://www.ecma-international.org/ecma-262/8.0/#prod-ControlEscape
  pp$1.regexp_eatControlEscape = function(state) {
    var ch = state.current();
    if (ch === 0x74 /* t */) {
      state.lastIntValue = 0x09; /* \t */
      state.advance();
      return true
    }
    if (ch === 0x6E /* n */) {
      state.lastIntValue = 0x0A; /* \n */
      state.advance();
      return true
    }
    if (ch === 0x76 /* v */) {
      state.lastIntValue = 0x0B; /* \v */
      state.advance();
      return true
    }
    if (ch === 0x66 /* f */) {
      state.lastIntValue = 0x0C; /* \f */
      state.advance();
      return true
    }
    if (ch === 0x72 /* r */) {
      state.lastIntValue = 0x0D; /* \r */
      state.advance();
      return true
    }
    return false
  };

  // https://www.ecma-international.org/ecma-262/8.0/#prod-ControlLetter
  pp$1.regexp_eatControlLetter = function(state) {
    var ch = state.current();
    if (isControlLetter(ch)) {
      state.lastIntValue = ch % 0x20;
      state.advance();
      return true
    }
    return false
  };
  function isControlLetter(ch) {
    return (
      (ch >= 0x41 /* A */ && ch <= 0x5A /* Z */) ||
      (ch >= 0x61 /* a */ && ch <= 0x7A /* z */)
    )
  }

  // https://www.ecma-international.org/ecma-262/8.0/#prod-RegExpUnicodeEscapeSequence
  pp$1.regexp_eatRegExpUnicodeEscapeSequence = function(state, forceU) {
    if ( forceU === void 0 ) forceU = false;

    var start = state.pos;
    var switchU = forceU || state.switchU;

    if (state.eat(0x75 /* u */)) {
      if (this.regexp_eatFixedHexDigits(state, 4)) {
        var lead = state.lastIntValue;
        if (switchU && lead >= 0xD800 && lead <= 0xDBFF) {
          var leadSurrogateEnd = state.pos;
          if (state.eat(0x5C /* \ */) && state.eat(0x75 /* u */) && this.regexp_eatFixedHexDigits(state, 4)) {
            var trail = state.lastIntValue;
            if (trail >= 0xDC00 && trail <= 0xDFFF) {
              state.lastIntValue = (lead - 0xD800) * 0x400 + (trail - 0xDC00) + 0x10000;
              return true
            }
          }
          state.pos = leadSurrogateEnd;
          state.lastIntValue = lead;
        }
        return true
      }
      if (
        switchU &&
        state.eat(0x7B /* { */) &&
        this.regexp_eatHexDigits(state) &&
        state.eat(0x7D /* } */) &&
        isValidUnicode(state.lastIntValue)
      ) {
        return true
      }
      if (switchU) {
        state.raise("Invalid unicode escape");
      }
      state.pos = start;
    }

    return false
  };
  function isValidUnicode(ch) {
    return ch >= 0 && ch <= 0x10FFFF
  }

  // https://www.ecma-international.org/ecma-262/8.0/#prod-annexB-IdentityEscape
  pp$1.regexp_eatIdentityEscape = function(state) {
    if (state.switchU) {
      if (this.regexp_eatSyntaxCharacter(state)) {
        return true
      }
      if (state.eat(0x2F /* / */)) {
        state.lastIntValue = 0x2F; /* / */
        return true
      }
      return false
    }

    var ch = state.current();
    if (ch !== 0x63 /* c */ && (!state.switchN || ch !== 0x6B /* k */)) {
      state.lastIntValue = ch;
      state.advance();
      return true
    }

    return false
  };

  // https://www.ecma-international.org/ecma-262/8.0/#prod-DecimalEscape
  pp$1.regexp_eatDecimalEscape = function(state) {
    state.lastIntValue = 0;
    var ch = state.current();
    if (ch >= 0x31 /* 1 */ && ch <= 0x39 /* 9 */) {
      do {
        state.lastIntValue = 10 * state.lastIntValue + (ch - 0x30 /* 0 */);
        state.advance();
      } while ((ch = state.current()) >= 0x30 /* 0 */ && ch <= 0x39 /* 9 */)
      return true
    }
    return false
  };

  // Return values used by character set parsing methods, needed to
  // forbid negation of sets that can match strings.
  var CharSetNone = 0; // Nothing parsed
  var CharSetOk = 1; // Construct parsed, cannot contain strings
  var CharSetString = 2; // Construct parsed, can contain strings

  // https://www.ecma-international.org/ecma-262/8.0/#prod-CharacterClassEscape
  pp$1.regexp_eatCharacterClassEscape = function(state) {
    var ch = state.current();

    if (isCharacterClassEscape(ch)) {
      state.lastIntValue = -1;
      state.advance();
      return CharSetOk
    }

    var negate = false;
    if (
      state.switchU &&
      this.options.ecmaVersion >= 9 &&
      ((negate = ch === 0x50 /* P */) || ch === 0x70 /* p */)
    ) {
      state.lastIntValue = -1;
      state.advance();
      var result;
      if (
        state.eat(0x7B /* { */) &&
        (result = this.regexp_eatUnicodePropertyValueExpression(state)) &&
        state.eat(0x7D /* } */)
      ) {
        if (negate && result === CharSetString) { state.raise("Invalid property name"); }
        return result
      }
      state.raise("Invalid property name");
    }

    return CharSetNone
  };

  function isCharacterClassEscape(ch) {
    return (
      ch === 0x64 /* d */ ||
      ch === 0x44 /* D */ ||
      ch === 0x73 /* s */ ||
      ch === 0x53 /* S */ ||
      ch === 0x77 /* w */ ||
      ch === 0x57 /* W */
    )
  }

  // UnicodePropertyValueExpression ::
  //   UnicodePropertyName `=` UnicodePropertyValue
  //   LoneUnicodePropertyNameOrValue
  pp$1.regexp_eatUnicodePropertyValueExpression = function(state) {
    var start = state.pos;

    // UnicodePropertyName `=` UnicodePropertyValue
    if (this.regexp_eatUnicodePropertyName(state) && state.eat(0x3D /* = */)) {
      var name = state.lastStringValue;
      if (this.regexp_eatUnicodePropertyValue(state)) {
        var value = state.lastStringValue;
        this.regexp_validateUnicodePropertyNameAndValue(state, name, value);
        return CharSetOk
      }
    }
    state.pos = start;

    // LoneUnicodePropertyNameOrValue
    if (this.regexp_eatLoneUnicodePropertyNameOrValue(state)) {
      var nameOrValue = state.lastStringValue;
      return this.regexp_validateUnicodePropertyNameOrValue(state, nameOrValue)
    }
    return CharSetNone
  };

  pp$1.regexp_validateUnicodePropertyNameAndValue = function(state, name, value) {
    if (!hasOwn(state.unicodeProperties.nonBinary, name))
      { state.raise("Invalid property name"); }
    if (!state.unicodeProperties.nonBinary[name].test(value))
      { state.raise("Invalid property value"); }
  };

  pp$1.regexp_validateUnicodePropertyNameOrValue = function(state, nameOrValue) {
    if (state.unicodeProperties.binary.test(nameOrValue)) { return CharSetOk }
    if (state.switchV && state.unicodeProperties.binaryOfStrings.test(nameOrValue)) { return CharSetString }
    state.raise("Invalid property name");
  };

  // UnicodePropertyName ::
  //   UnicodePropertyNameCharacters
  pp$1.regexp_eatUnicodePropertyName = function(state) {
    var ch = 0;
    state.lastStringValue = "";
    while (isUnicodePropertyNameCharacter(ch = state.current())) {
      state.lastStringValue += codePointToString(ch);
      state.advance();
    }
    return state.lastStringValue !== ""
  };

  function isUnicodePropertyNameCharacter(ch) {
    return isControlLetter(ch) || ch === 0x5F /* _ */
  }

  // UnicodePropertyValue ::
  //   UnicodePropertyValueCharacters
  pp$1.regexp_eatUnicodePropertyValue = function(state) {
    var ch = 0;
    state.lastStringValue = "";
    while (isUnicodePropertyValueCharacter(ch = state.current())) {
      state.lastStringValue += codePointToString(ch);
      state.advance();
    }
    return state.lastStringValue !== ""
  };
  function isUnicodePropertyValueCharacter(ch) {
    return isUnicodePropertyNameCharacter(ch) || isDecimalDigit(ch)
  }

  // LoneUnicodePropertyNameOrValue ::
  //   UnicodePropertyValueCharacters
  pp$1.regexp_eatLoneUnicodePropertyNameOrValue = function(state) {
    return this.regexp_eatUnicodePropertyValue(state)
  };

  // https://www.ecma-international.org/ecma-262/8.0/#prod-CharacterClass
  pp$1.regexp_eatCharacterClass = function(state) {
    if (state.eat(0x5B /* [ */)) {
      var negate = state.eat(0x5E /* ^ */);
      var result = this.regexp_classContents(state);
      if (!state.eat(0x5D /* ] */))
        { state.raise("Unterminated character class"); }
      if (negate && result === CharSetString)
        { state.raise("Negated character class may contain strings"); }
      return true
    }
    return false
  };

  // https://tc39.es/ecma262/#prod-ClassContents
  // https://www.ecma-international.org/ecma-262/8.0/#prod-ClassRanges
  pp$1.regexp_classContents = function(state) {
    if (state.current() === 0x5D /* ] */) { return CharSetOk }
    if (state.switchV) { return this.regexp_classSetExpression(state) }
    this.regexp_nonEmptyClassRanges(state);
    return CharSetOk
  };

  // https://www.ecma-international.org/ecma-262/8.0/#prod-NonemptyClassRanges
  // https://www.ecma-international.org/ecma-262/8.0/#prod-NonemptyClassRangesNoDash
  pp$1.regexp_nonEmptyClassRanges = function(state) {
    while (this.regexp_eatClassAtom(state)) {
      var left = state.lastIntValue;
      if (state.eat(0x2D /* - */) && this.regexp_eatClassAtom(state)) {
        var right = state.lastIntValue;
        if (state.switchU && (left === -1 || right === -1)) {
          state.raise("Invalid character class");
        }
        if (left !== -1 && right !== -1 && left > right) {
          state.raise("Range out of order in character class");
        }
      }
    }
  };

  // https://www.ecma-international.org/ecma-262/8.0/#prod-ClassAtom
  // https://www.ecma-international.org/ecma-262/8.0/#prod-ClassAtomNoDash
  pp$1.regexp_eatClassAtom = function(state) {
    var start = state.pos;

    if (state.eat(0x5C /* \ */)) {
      if (this.regexp_eatClassEscape(state)) {
        return true
      }
      if (state.switchU) {
        // Make the same message as V8.
        var ch$1 = state.current();
        if (ch$1 === 0x63 /* c */ || isOctalDigit(ch$1)) {
          state.raise("Invalid class escape");
        }
        state.raise("Invalid escape");
      }
      state.pos = start;
    }

    var ch = state.current();
    if (ch !== 0x5D /* ] */) {
      state.lastIntValue = ch;
      state.advance();
      return true
    }

    return false
  };

  // https://www.ecma-international.org/ecma-262/8.0/#prod-annexB-ClassEscape
  pp$1.regexp_eatClassEscape = function(state) {
    var start = state.pos;

    if (state.eat(0x62 /* b */)) {
      state.lastIntValue = 0x08; /* <BS> */
      return true
    }

    if (state.switchU && state.eat(0x2D /* - */)) {
      state.lastIntValue = 0x2D; /* - */
      return true
    }

    if (!state.switchU && state.eat(0x63 /* c */)) {
      if (this.regexp_eatClassControlLetter(state)) {
        return true
      }
      state.pos = start;
    }

    return (
      this.regexp_eatCharacterClassEscape(state) ||
      this.regexp_eatCharacterEscape(state)
    )
  };

  // https://tc39.es/ecma262/#prod-ClassSetExpression
  // https://tc39.es/ecma262/#prod-ClassUnion
  // https://tc39.es/ecma262/#prod-ClassIntersection
  // https://tc39.es/ecma262/#prod-ClassSubtraction
  pp$1.regexp_classSetExpression = function(state) {
    var result = CharSetOk, subResult;
    if (this.regexp_eatClassSetRange(state)) ; else if (subResult = this.regexp_eatClassSetOperand(state)) {
      if (subResult === CharSetString) { result = CharSetString; }
      // https://tc39.es/ecma262/#prod-ClassIntersection
      var start = state.pos;
      while (state.eatChars([0x26, 0x26] /* && */)) {
        if (
          state.current() !== 0x26 /* & */ &&
          (subResult = this.regexp_eatClassSetOperand(state))
        ) {
          if (subResult !== CharSetString) { result = CharSetOk; }
          continue
        }
        state.raise("Invalid character in character class");
      }
      if (start !== state.pos) { return result }
      // https://tc39.es/ecma262/#prod-ClassSubtraction
      while (state.eatChars([0x2D, 0x2D] /* -- */)) {
        if (this.regexp_eatClassSetOperand(state)) { continue }
        state.raise("Invalid character in character class");
      }
      if (start !== state.pos) { return result }
    } else {
      state.raise("Invalid character in character class");
    }
    // https://tc39.es/ecma262/#prod-ClassUnion
    for (;;) {
      if (this.regexp_eatClassSetRange(state)) { continue }
      subResult = this.regexp_eatClassSetOperand(state);
      if (!subResult) { return result }
      if (subResult === CharSetString) { result = CharSetString; }
    }
  };

  // https://tc39.es/ecma262/#prod-ClassSetRange
  pp$1.regexp_eatClassSetRange = function(state) {
    var start = state.pos;
    if (this.regexp_eatClassSetCharacter(state)) {
      var left = state.lastIntValue;
      if (state.eat(0x2D /* - */) && this.regexp_eatClassSetCharacter(state)) {
        var right = state.lastIntValue;
        if (left !== -1 && right !== -1 && left > right) {
          state.raise("Range out of order in character class");
        }
        return true
      }
      state.pos = start;
    }
    return false
  };

  // https://tc39.es/ecma262/#prod-ClassSetOperand
  pp$1.regexp_eatClassSetOperand = function(state) {
    if (this.regexp_eatClassSetCharacter(state)) { return CharSetOk }
    return this.regexp_eatClassStringDisjunction(state) || this.regexp_eatNestedClass(state)
  };

  // https://tc39.es/ecma262/#prod-NestedClass
  pp$1.regexp_eatNestedClass = function(state) {
    var start = state.pos;
    if (state.eat(0x5B /* [ */)) {
      var negate = state.eat(0x5E /* ^ */);
      var result = this.regexp_classContents(state);
      if (state.eat(0x5D /* ] */)) {
        if (negate && result === CharSetString) {
          state.raise("Negated character class may contain strings");
        }
        return result
      }
      state.pos = start;
    }
    if (state.eat(0x5C /* \ */)) {
      var result$1 = this.regexp_eatCharacterClassEscape(state);
      if (result$1) {
        return result$1
      }
      state.pos = start;
    }
    return null
  };

  // https://tc39.es/ecma262/#prod-ClassStringDisjunction
  pp$1.regexp_eatClassStringDisjunction = function(state) {
    var start = state.pos;
    if (state.eatChars([0x5C, 0x71] /* \q */)) {
      if (state.eat(0x7B /* { */)) {
        var result = this.regexp_classStringDisjunctionContents(state);
        if (state.eat(0x7D /* } */)) {
          return result
        }
      } else {
        // Make the same message as V8.
        state.raise("Invalid escape");
      }
      state.pos = start;
    }
    return null
  };

  // https://tc39.es/ecma262/#prod-ClassStringDisjunctionContents
  pp$1.regexp_classStringDisjunctionContents = function(state) {
    var result = this.regexp_classString(state);
    while (state.eat(0x7C /* | */)) {
      if (this.regexp_classString(state) === CharSetString) { result = CharSetString; }
    }
    return result
  };

  // https://tc39.es/ecma262/#prod-ClassString
  // https://tc39.es/ecma262/#prod-NonEmptyClassString
  pp$1.regexp_classString = function(state) {
    var count = 0;
    while (this.regexp_eatClassSetCharacter(state)) { count++; }
    return count === 1 ? CharSetOk : CharSetString
  };

  // https://tc39.es/ecma262/#prod-ClassSetCharacter
  pp$1.regexp_eatClassSetCharacter = function(state) {
    var start = state.pos;
    if (state.eat(0x5C /* \ */)) {
      if (
        this.regexp_eatCharacterEscape(state) ||
        this.regexp_eatClassSetReservedPunctuator(state)
      ) {
        return true
      }
      if (state.eat(0x62 /* b */)) {
        state.lastIntValue = 0x08; /* <BS> */
        return true
      }
      state.pos = start;
      return false
    }
    var ch = state.current();
    if (ch < 0 || ch === state.lookahead() && isClassSetReservedDoublePunctuatorCharacter(ch)) { return false }
    if (isClassSetSyntaxCharacter(ch)) { return false }
    state.advance();
    state.lastIntValue = ch;
    return true
  };

  // https://tc39.es/ecma262/#prod-ClassSetReservedDoublePunctuator
  function isClassSetReservedDoublePunctuatorCharacter(ch) {
    return (
      ch === 0x21 /* ! */ ||
      ch >= 0x23 /* # */ && ch <= 0x26 /* & */ ||
      ch >= 0x2A /* * */ && ch <= 0x2C /* , */ ||
      ch === 0x2E /* . */ ||
      ch >= 0x3A /* : */ && ch <= 0x40 /* @ */ ||
      ch === 0x5E /* ^ */ ||
      ch === 0x60 /* ` */ ||
      ch === 0x7E /* ~ */
    )
  }

  // https://tc39.es/ecma262/#prod-ClassSetSyntaxCharacter
  function isClassSetSyntaxCharacter(ch) {
    return (
      ch === 0x28 /* ( */ ||
      ch === 0x29 /* ) */ ||
      ch === 0x2D /* - */ ||
      ch === 0x2F /* / */ ||
      ch >= 0x5B /* [ */ && ch <= 0x5D /* ] */ ||
      ch >= 0x7B /* { */ && ch <= 0x7D /* } */
    )
  }

  // https://tc39.es/ecma262/#prod-ClassSetReservedPunctuator
  pp$1.regexp_eatClassSetReservedPunctuator = function(state) {
    var ch = state.current();
    if (isClassSetReservedPunctuator(ch)) {
      state.lastIntValue = ch;
      state.advance();
      return true
    }
    return false
  };

  // https://tc39.es/ecma262/#prod-ClassSetReservedPunctuator
  function isClassSetReservedPunctuator(ch) {
    return (
      ch === 0x21 /* ! */ ||
      ch === 0x23 /* # */ ||
      ch === 0x25 /* % */ ||
      ch === 0x26 /* & */ ||
      ch === 0x2C /* , */ ||
      ch === 0x2D /* - */ ||
      ch >= 0x3A /* : */ && ch <= 0x3E /* > */ ||
      ch === 0x40 /* @ */ ||
      ch === 0x60 /* ` */ ||
      ch === 0x7E /* ~ */
    )
  }

  // https://www.ecma-international.org/ecma-262/8.0/#prod-annexB-ClassControlLetter
  pp$1.regexp_eatClassControlLetter = function(state) {
    var ch = state.current();
    if (isDecimalDigit(ch) || ch === 0x5F /* _ */) {
      state.lastIntValue = ch % 0x20;
      state.advance();
      return true
    }
    return false
  };

  // https://www.ecma-international.org/ecma-262/8.0/#prod-HexEscapeSequence
  pp$1.regexp_eatHexEscapeSequence = function(state) {
    var start = state.pos;
    if (state.eat(0x78 /* x */)) {
      if (this.regexp_eatFixedHexDigits(state, 2)) {
        return true
      }
      if (state.switchU) {
        state.raise("Invalid escape");
      }
      state.pos = start;
    }
    return false
  };

  // https://www.ecma-international.org/ecma-262/8.0/#prod-DecimalDigits
  pp$1.regexp_eatDecimalDigits = function(state) {
    var start = state.pos;
    var ch = 0;
    state.lastIntValue = 0;
    while (isDecimalDigit(ch = state.current())) {
      state.lastIntValue = 10 * state.lastIntValue + (ch - 0x30 /* 0 */);
      state.advance();
    }
    return state.pos !== start
  };
  function isDecimalDigit(ch) {
    return ch >= 0x30 /* 0 */ && ch <= 0x39 /* 9 */
  }

  // https://www.ecma-international.org/ecma-262/8.0/#prod-HexDigits
  pp$1.regexp_eatHexDigits = function(state) {
    var start = state.pos;
    var ch = 0;
    state.lastIntValue = 0;
    while (isHexDigit(ch = state.current())) {
      state.lastIntValue = 16 * state.lastIntValue + hexToInt(ch);
      state.advance();
    }
    return state.pos !== start
  };
  function isHexDigit(ch) {
    return (
      (ch >= 0x30 /* 0 */ && ch <= 0x39 /* 9 */) ||
      (ch >= 0x41 /* A */ && ch <= 0x46 /* F */) ||
      (ch >= 0x61 /* a */ && ch <= 0x66 /* f */)
    )
  }
  function hexToInt(ch) {
    if (ch >= 0x41 /* A */ && ch <= 0x46 /* F */) {
      return 10 + (ch - 0x41 /* A */)
    }
    if (ch >= 0x61 /* a */ && ch <= 0x66 /* f */) {
      return 10 + (ch - 0x61 /* a */)
    }
    return ch - 0x30 /* 0 */
  }

  // https://www.ecma-international.org/ecma-262/8.0/#prod-annexB-LegacyOctalEscapeSequence
  // Allows only 0-377(octal) i.e. 0-255(decimal).
  pp$1.regexp_eatLegacyOctalEscapeSequence = function(state) {
    if (this.regexp_eatOctalDigit(state)) {
      var n1 = state.lastIntValue;
      if (this.regexp_eatOctalDigit(state)) {
        var n2 = state.lastIntValue;
        if (n1 <= 3 && this.regexp_eatOctalDigit(state)) {
          state.lastIntValue = n1 * 64 + n2 * 8 + state.lastIntValue;
        } else {
          state.lastIntValue = n1 * 8 + n2;
        }
      } else {
        state.lastIntValue = n1;
      }
      return true
    }
    return false
  };

  // https://www.ecma-international.org/ecma-262/8.0/#prod-OctalDigit
  pp$1.regexp_eatOctalDigit = function(state) {
    var ch = state.current();
    if (isOctalDigit(ch)) {
      state.lastIntValue = ch - 0x30; /* 0 */
      state.advance();
      return true
    }
    state.lastIntValue = 0;
    return false
  };
  function isOctalDigit(ch) {
    return ch >= 0x30 /* 0 */ && ch <= 0x37 /* 7 */
  }

  // https://www.ecma-international.org/ecma-262/8.0/#prod-Hex4Digits
  // https://www.ecma-international.org/ecma-262/8.0/#prod-HexDigit
  // And HexDigit HexDigit in https://www.ecma-international.org/ecma-262/8.0/#prod-HexEscapeSequence
  pp$1.regexp_eatFixedHexDigits = function(state, length) {
    var start = state.pos;
    state.lastIntValue = 0;
    for (var i = 0; i < length; ++i) {
      var ch = state.current();
      if (!isHexDigit(ch)) {
        state.pos = start;
        return false
      }
      state.lastIntValue = 16 * state.lastIntValue + hexToInt(ch);
      state.advance();
    }
    return true
  };

  // Object type used to represent tokens. Note that normally, tokens
  // simply exist as properties on the parser object. This is only
  // used for the onToken callback and the external tokenizer.

  var Token = function Token(p) {
    this.type = p.type;
    this.value = p.value;
    this.start = p.start;
    this.end = p.end;
    if (p.options.locations)
      { this.loc = new SourceLocation(p, p.startLoc, p.endLoc); }
    if (p.options.ranges)
      { this.range = [p.start, p.end]; }
  };

  // ## Tokenizer

  var pp = Parser.prototype;

  // Move to the next token

  pp.next = function(ignoreEscapeSequenceInKeyword) {
    if (!ignoreEscapeSequenceInKeyword && this.type.keyword && this.containsEsc)
      { this.raiseRecoverable(this.start, "Escape sequence in keyword " + this.type.keyword); }
    if (this.options.onToken)
      { this.options.onToken(new Token(this)); }

    this.lastTokEnd = this.end;
    this.lastTokStart = this.start;
    this.lastTokEndLoc = this.endLoc;
    this.lastTokStartLoc = this.startLoc;
    this.nextToken();
  };

  pp.getToken = function() {
    this.next();
    return new Token(this)
  };

  // If we're in an ES6 environment, make parsers iterable
  if (typeof Symbol !== "undefined")
    { pp[Symbol.iterator] = function() {
      var this$1$1 = this;

      return {
        next: function () {
          var token = this$1$1.getToken();
          return {
            done: token.type === types$1.eof,
            value: token
          }
        }
      }
    }; }

  // Toggle strict mode. Re-reads the next number or string to please
  // pedantic tests (`"use strict"; 010;` should fail).

  // Read a single token, updating the parser object's token-related
  // properties.

  pp.nextToken = function() {
    var curContext = this.curContext();
    if (!curContext || !curContext.preserveSpace) { this.skipSpace(); }

    this.start = this.pos;
    if (this.options.locations) { this.startLoc = this.curPosition(); }
    if (this.pos >= this.input.length) { return this.finishToken(types$1.eof) }

    if (curContext.override) { return curContext.override(this) }
    else { this.readToken(this.fullCharCodeAtPos()); }
  };

  pp.readToken = function(code) {
    // Identifier or keyword. '\uXXXX' sequences are allowed in
    // identifiers, so '\' also dispatches to that.
    if (isIdentifierStart(code, this.options.ecmaVersion >= 6) || code === 92 /* '\' */)
      { return this.readWord() }

    return this.getTokenFromCode(code)
  };

  pp.fullCharCodeAt = function(pos) {
    var code = this.input.charCodeAt(pos);
    if (code <= 0xd7ff || code >= 0xdc00) { return code }
    var next = this.input.charCodeAt(pos + 1);
    return next <= 0xdbff || next >= 0xe000 ? code : (code << 10) + next - 0x35fdc00
  };

  pp.fullCharCodeAtPos = function() {
    return this.fullCharCodeAt(this.pos)
  };

  pp.skipBlockComment = function() {
    var startLoc = this.options.onComment && this.curPosition();
    var start = this.pos, end = this.input.indexOf("*/", this.pos += 2);
    if (end === -1) { this.raise(this.pos - 2, "Unterminated comment"); }
    this.pos = end + 2;
    if (this.options.locations) {
      for (var nextBreak = (void 0), pos = start; (nextBreak = nextLineBreak(this.input, pos, this.pos)) > -1;) {
        ++this.curLine;
        pos = this.lineStart = nextBreak;
      }
    }
    if (this.options.onComment)
      { this.options.onComment(true, this.input.slice(start + 2, end), start, this.pos,
                             startLoc, this.curPosition()); }
  };

  pp.skipLineComment = function(startSkip) {
    var start = this.pos;
    var startLoc = this.options.onComment && this.curPosition();
    var ch = this.input.charCodeAt(this.pos += startSkip);
    while (this.pos < this.input.length && !isNewLine(ch)) {
      ch = this.input.charCodeAt(++this.pos);
    }
    if (this.options.onComment)
      { this.options.onComment(false, this.input.slice(start + startSkip, this.pos), start, this.pos,
                             startLoc, this.curPosition()); }
  };

  // Called at the start of the parse and after every token. Skips
  // whitespace and comments, and.

  pp.skipSpace = function() {
    loop: while (this.pos < this.input.length) {
      var ch = this.input.charCodeAt(this.pos);
      switch (ch) {
      case 32: case 160: // ' '
        ++this.pos;
        break
      case 13:
        if (this.input.charCodeAt(this.pos + 1) === 10) {
          ++this.pos;
        }
      case 10: case 8232: case 8233:
        ++this.pos;
        if (this.options.locations) {
          ++this.curLine;
          this.lineStart = this.pos;
        }
        break
      case 47: // '/'
        switch (this.input.charCodeAt(this.pos + 1)) {
        case 42: // '*'
          this.skipBlockComment();
          break
        case 47:
          this.skipLineComment(2);
          break
        default:
          break loop
        }
        break
      default:
        if (ch > 8 && ch < 14 || ch >= 5760 && nonASCIIwhitespace.test(String.fromCharCode(ch))) {
          ++this.pos;
        } else {
          break loop
        }
      }
    }
  };

  // Called at the end of every token. Sets `end`, `val`, and
  // maintains `context` and `exprAllowed`, and skips the space after
  // the token, so that the next one's `start` will point at the
  // right position.

  pp.finishToken = function(type, val) {
    this.end = this.pos;
    if (this.options.locations) { this.endLoc = this.curPosition(); }
    var prevType = this.type;
    this.type = type;
    this.value = val;

    this.updateContext(prevType);
  };

  // ### Token reading

  // This is the function that is called to fetch the next token. It
  // is somewhat obscure, because it works in character codes rather
  // than characters, and because operator parsing has been inlined
  // into it.
  //
  // All in the name of speed.
  //
  pp.readToken_dot = function() {
    var next = this.input.charCodeAt(this.pos + 1);
    if (next >= 48 && next <= 57) { return this.readNumber(true) }
    var next2 = this.input.charCodeAt(this.pos + 2);
    if (this.options.ecmaVersion >= 6 && next === 46 && next2 === 46) { // 46 = dot '.'
      this.pos += 3;
      return this.finishToken(types$1.ellipsis)
    } else {
      ++this.pos;
      return this.finishToken(types$1.dot)
    }
  };

  pp.readToken_slash = function() { // '/'
    var next = this.input.charCodeAt(this.pos + 1);
    if (this.exprAllowed) { ++this.pos; return this.readRegexp() }
    if (next === 61) { return this.finishOp(types$1.assign, 2) }
    return this.finishOp(types$1.slash, 1)
  };

  pp.readToken_mult_modulo_exp = function(code) { // '%*'
    var next = this.input.charCodeAt(this.pos + 1);
    var size = 1;
    var tokentype = code === 42 ? types$1.star : types$1.modulo;

    // exponentiation operator ** and **=
    if (this.options.ecmaVersion >= 7 && code === 42 && next === 42) {
      ++size;
      tokentype = types$1.starstar;
      next = this.input.charCodeAt(this.pos + 2);
    }

    if (next === 61) { return this.finishOp(types$1.assign, size + 1) }
    return this.finishOp(tokentype, size)
  };

  pp.readToken_pipe_amp = function(code) { // '|&'
    var next = this.input.charCodeAt(this.pos + 1);
    if (next === code) {
      if (this.options.ecmaVersion >= 12) {
        var next2 = this.input.charCodeAt(this.pos + 2);
        if (next2 === 61) { return this.finishOp(types$1.assign, 3) }
      }
      return this.finishOp(code === 124 ? types$1.logicalOR : types$1.logicalAND, 2)
    }
    if (next === 61) { return this.finishOp(types$1.assign, 2) }
    return this.finishOp(code === 124 ? types$1.bitwiseOR : types$1.bitwiseAND, 1)
  };

  pp.readToken_caret = function() { // '^'
    var next = this.input.charCodeAt(this.pos + 1);
    if (next === 61) { return this.finishOp(types$1.assign, 2) }
    return this.finishOp(types$1.bitwiseXOR, 1)
  };

  pp.readToken_plus_min = function(code) { // '+-'
    var next = this.input.charCodeAt(this.pos + 1);
    if (next === code) {
      if (next === 45 && !this.inModule && this.input.charCodeAt(this.pos + 2) === 62 &&
          (this.lastTokEnd === 0 || lineBreak.test(this.input.slice(this.lastTokEnd, this.pos)))) {
        // A `-->` line comment
        this.skipLineComment(3);
        this.skipSpace();
        return this.nextToken()
      }
      return this.finishOp(types$1.incDec, 2)
    }
    if (next === 61) { return this.finishOp(types$1.assign, 2) }
    return this.finishOp(types$1.plusMin, 1)
  };

  pp.readToken_lt_gt = function(code) { // '<>'
    var next = this.input.charCodeAt(this.pos + 1);
    var size = 1;
    if (next === code) {
      size = code === 62 && this.input.charCodeAt(this.pos + 2) === 62 ? 3 : 2;
      if (this.input.charCodeAt(this.pos + size) === 61) { return this.finishOp(types$1.assign, size + 1) }
      return this.finishOp(types$1.bitShift, size)
    }
    if (next === 33 && code === 60 && !this.inModule && this.input.charCodeAt(this.pos + 2) === 45 &&
        this.input.charCodeAt(this.pos + 3) === 45) {
      // `<!--`, an XML-style comment that should be interpreted as a line comment
      this.skipLineComment(4);
      this.skipSpace();
      return this.nextToken()
    }
    if (next === 61) { size = 2; }
    return this.finishOp(types$1.relational, size)
  };

  pp.readToken_eq_excl = function(code) { // '=!'
    var next = this.input.charCodeAt(this.pos + 1);
    if (next === 61) { return this.finishOp(types$1.equality, this.input.charCodeAt(this.pos + 2) === 61 ? 3 : 2) }
    if (code === 61 && next === 62 && this.options.ecmaVersion >= 6) { // '=>'
      this.pos += 2;
      return this.finishToken(types$1.arrow)
    }
    return this.finishOp(code === 61 ? types$1.eq : types$1.prefix, 1)
  };

  pp.readToken_question = function() { // '?'
    var ecmaVersion = this.options.ecmaVersion;
    if (ecmaVersion >= 11) {
      var next = this.input.charCodeAt(this.pos + 1);
      if (next === 46) {
        var next2 = this.input.charCodeAt(this.pos + 2);
        if (next2 < 48 || next2 > 57) { return this.finishOp(types$1.questionDot, 2) }
      }
      if (next === 63) {
        if (ecmaVersion >= 12) {
          var next2$1 = this.input.charCodeAt(this.pos + 2);
          if (next2$1 === 61) { return this.finishOp(types$1.assign, 3) }
        }
        return this.finishOp(types$1.coalesce, 2)
      }
    }
    return this.finishOp(types$1.question, 1)
  };

  pp.readToken_numberSign = function() { // '#'
    var ecmaVersion = this.options.ecmaVersion;
    var code = 35; // '#'
    if (ecmaVersion >= 13) {
      ++this.pos;
      code = this.fullCharCodeAtPos();
      if (isIdentifierStart(code, true) || code === 92 /* '\' */) {
        return this.finishToken(types$1.privateId, this.readWord1())
      }
    }

    this.raise(this.pos, "Unexpected character '" + codePointToString(code) + "'");
  };

  pp.getTokenFromCode = function(code) {
    switch (code) {
    // The interpretation of a dot depends on whether it is followed
    // by a digit or another two dots.
    case 46: // '.'
      return this.readToken_dot()

    // Punctuation tokens.
    case 40: ++this.pos; return this.finishToken(types$1.parenL)
    case 41: ++this.pos; return this.finishToken(types$1.parenR)
    case 59: ++this.pos; return this.finishToken(types$1.semi)
    case 44: ++this.pos; return this.finishToken(types$1.comma)
    case 91: ++this.pos; return this.finishToken(types$1.bracketL)
    case 93: ++this.pos; return this.finishToken(types$1.bracketR)
    case 123: ++this.pos; return this.finishToken(types$1.braceL)
    case 125: ++this.pos; return this.finishToken(types$1.braceR)
    case 58: ++this.pos; return this.finishToken(types$1.colon)

    case 96: // '`'
      if (this.options.ecmaVersion < 6) { break }
      ++this.pos;
      return this.finishToken(types$1.backQuote)

    case 48: // '0'
      var next = this.input.charCodeAt(this.pos + 1);
      if (next === 120 || next === 88) { return this.readRadixNumber(16) } // '0x', '0X' - hex number
      if (this.options.ecmaVersion >= 6) {
        if (next === 111 || next === 79) { return this.readRadixNumber(8) } // '0o', '0O' - octal number
        if (next === 98 || next === 66) { return this.readRadixNumber(2) } // '0b', '0B' - binary number
      }

    // Anything else beginning with a digit is an integer, octal
    // number, or float.
    case 49: case 50: case 51: case 52: case 53: case 54: case 55: case 56: case 57: // 1-9
      return this.readNumber(false)

    // Quotes produce strings.
    case 34: case 39: // '"', "'"
      return this.readString(code)

    // Operators are parsed inline in tiny state machines. '=' (61) is
    // often referred to. `finishOp` simply skips the amount of
    // characters it is given as second argument, and returns a token
    // of the type given by its first argument.
    case 47: // '/'
      return this.readToken_slash()

    case 37: case 42: // '%*'
      return this.readToken_mult_modulo_exp(code)

    case 124: case 38: // '|&'
      return this.readToken_pipe_amp(code)

    case 94: // '^'
      return this.readToken_caret()

    case 43: case 45: // '+-'
      return this.readToken_plus_min(code)

    case 60: case 62: // '<>'
      return this.readToken_lt_gt(code)

    case 61: case 33: // '=!'
      return this.readToken_eq_excl(code)

    case 63: // '?'
      return this.readToken_question()

    case 126: // '~'
      return this.finishOp(types$1.prefix, 1)

    case 35: // '#'
      return this.readToken_numberSign()
    }

    this.raise(this.pos, "Unexpected character '" + codePointToString(code) + "'");
  };

  pp.finishOp = function(type, size) {
    var str = this.input.slice(this.pos, this.pos + size);
    this.pos += size;
    return this.finishToken(type, str)
  };

  pp.readRegexp = function() {
    var escaped, inClass, start = this.pos;
    for (;;) {
      if (this.pos >= this.input.length) { this.raise(start, "Unterminated regular expression"); }
      var ch = this.input.charAt(this.pos);
      if (lineBreak.test(ch)) { this.raise(start, "Unterminated regular expression"); }
      if (!escaped) {
        if (ch === "[") { inClass = true; }
        else if (ch === "]" && inClass) { inClass = false; }
        else if (ch === "/" && !inClass) { break }
        escaped = ch === "\\";
      } else { escaped = false; }
      ++this.pos;
    }
    var pattern = this.input.slice(start, this.pos);
    ++this.pos;
    var flagsStart = this.pos;
    var flags = this.readWord1();
    if (this.containsEsc) { this.unexpected(flagsStart); }

    // Validate pattern
    var state = this.regexpState || (this.regexpState = new RegExpValidationState(this));
    state.reset(start, pattern, flags);
    this.validateRegExpFlags(state);
    this.validateRegExpPattern(state);

    // Create Literal#value property value.
    var value = null;
    try {
      value = new RegExp(pattern, flags);
    } catch (e) {
      // ESTree requires null if it failed to instantiate RegExp object.
      // https://github.com/estree/estree/blob/a27003adf4fd7bfad44de9cef372a2eacd527b1c/es5.md#regexpliteral
    }

    return this.finishToken(types$1.regexp, {pattern: pattern, flags: flags, value: value})
  };

  // Read an integer in the given radix. Return null if zero digits
  // were read, the integer value otherwise. When `len` is given, this
  // will return `null` unless the integer has exactly `len` digits.

  pp.readInt = function(radix, len, maybeLegacyOctalNumericLiteral) {
    // `len` is used for character escape sequences. In that case, disallow separators.
    var allowSeparators = this.options.ecmaVersion >= 12 && len === undefined;

    // `maybeLegacyOctalNumericLiteral` is true if it doesn't have prefix (0x,0o,0b)
    // and isn't fraction part nor exponent part. In that case, if the first digit
    // is zero then disallow separators.
    var isLegacyOctalNumericLiteral = maybeLegacyOctalNumericLiteral && this.input.charCodeAt(this.pos) === 48;

    var start = this.pos, total = 0, lastCode = 0;
    for (var i = 0, e = len == null ? Infinity : len; i < e; ++i, ++this.pos) {
      var code = this.input.charCodeAt(this.pos), val = (void 0);

      if (allowSeparators && code === 95) {
        if (isLegacyOctalNumericLiteral) { this.raiseRecoverable(this.pos, "Numeric separator is not allowed in legacy octal numeric literals"); }
        if (lastCode === 95) { this.raiseRecoverable(this.pos, "Numeric separator must be exactly one underscore"); }
        if (i === 0) { this.raiseRecoverable(this.pos, "Numeric separator is not allowed at the first of digits"); }
        lastCode = code;
        continue
      }

      if (code >= 97) { val = code - 97 + 10; } // a
      else if (code >= 65) { val = code - 65 + 10; } // A
      else if (code >= 48 && code <= 57) { val = code - 48; } // 0-9
      else { val = Infinity; }
      if (val >= radix) { break }
      lastCode = code;
      total = total * radix + val;
    }

    if (allowSeparators && lastCode === 95) { this.raiseRecoverable(this.pos - 1, "Numeric separator is not allowed at the last of digits"); }
    if (this.pos === start || len != null && this.pos - start !== len) { return null }

    return total
  };

  function stringToNumber(str, isLegacyOctalNumericLiteral) {
    if (isLegacyOctalNumericLiteral) {
      return parseInt(str, 8)
    }

    // `parseFloat(value)` stops parsing at the first numeric separator then returns a wrong value.
    return parseFloat(str.replace(/_/g, ""))
  }

  function stringToBigInt(str) {
    if (typeof BigInt !== "function") {
      return null
    }

    // `BigInt(value)` throws syntax error if the string contains numeric separators.
    return BigInt(str.replace(/_/g, ""))
  }

  pp.readRadixNumber = function(radix) {
    var start = this.pos;
    this.pos += 2; // 0x
    var val = this.readInt(radix);
    if (val == null) { this.raise(this.start + 2, "Expected number in radix " + radix); }
    if (this.options.ecmaVersion >= 11 && this.input.charCodeAt(this.pos) === 110) {
      val = stringToBigInt(this.input.slice(start, this.pos));
      ++this.pos;
    } else if (isIdentifierStart(this.fullCharCodeAtPos())) { this.raise(this.pos, "Identifier directly after number"); }
    return this.finishToken(types$1.num, val)
  };

  // Read an integer, octal integer, or floating-point number.

  pp.readNumber = function(startsWithDot) {
    var start = this.pos;
    if (!startsWithDot && this.readInt(10, undefined, true) === null) { this.raise(start, "Invalid number"); }
    var octal = this.pos - start >= 2 && this.input.charCodeAt(start) === 48;
    if (octal && this.strict) { this.raise(start, "Invalid number"); }
    var next = this.input.charCodeAt(this.pos);
    if (!octal && !startsWithDot && this.options.ecmaVersion >= 11 && next === 110) {
      var val$1 = stringToBigInt(this.input.slice(start, this.pos));
      ++this.pos;
      if (isIdentifierStart(this.fullCharCodeAtPos())) { this.raise(this.pos, "Identifier directly after number"); }
      return this.finishToken(types$1.num, val$1)
    }
    if (octal && /[89]/.test(this.input.slice(start, this.pos))) { octal = false; }
    if (next === 46 && !octal) { // '.'
      ++this.pos;
      this.readInt(10);
      next = this.input.charCodeAt(this.pos);
    }
    if ((next === 69 || next === 101) && !octal) { // 'eE'
      next = this.input.charCodeAt(++this.pos);
      if (next === 43 || next === 45) { ++this.pos; } // '+-'
      if (this.readInt(10) === null) { this.raise(start, "Invalid number"); }
    }
    if (isIdentifierStart(this.fullCharCodeAtPos())) { this.raise(this.pos, "Identifier directly after number"); }

    var val = stringToNumber(this.input.slice(start, this.pos), octal);
    return this.finishToken(types$1.num, val)
  };

  // Read a string value, interpreting backslash-escapes.

  pp.readCodePoint = function() {
    var ch = this.input.charCodeAt(this.pos), code;

    if (ch === 123) { // '{'
      if (this.options.ecmaVersion < 6) { this.unexpected(); }
      var codePos = ++this.pos;
      code = this.readHexChar(this.input.indexOf("}", this.pos) - this.pos);
      ++this.pos;
      if (code > 0x10FFFF) { this.invalidStringToken(codePos, "Code point out of bounds"); }
    } else {
      code = this.readHexChar(4);
    }
    return code
  };

  pp.readString = function(quote) {
    var out = "", chunkStart = ++this.pos;
    for (;;) {
      if (this.pos >= this.input.length) { this.raise(this.start, "Unterminated string constant"); }
      var ch = this.input.charCodeAt(this.pos);
      if (ch === quote) { break }
      if (ch === 92) { // '\'
        out += this.input.slice(chunkStart, this.pos);
        out += this.readEscapedChar(false);
        chunkStart = this.pos;
      } else if (ch === 0x2028 || ch === 0x2029) {
        if (this.options.ecmaVersion < 10) { this.raise(this.start, "Unterminated string constant"); }
        ++this.pos;
        if (this.options.locations) {
          this.curLine++;
          this.lineStart = this.pos;
        }
      } else {
        if (isNewLine(ch)) { this.raise(this.start, "Unterminated string constant"); }
        ++this.pos;
      }
    }
    out += this.input.slice(chunkStart, this.pos++);
    return this.finishToken(types$1.string, out)
  };

  // Reads template string tokens.

  var INVALID_TEMPLATE_ESCAPE_ERROR = {};

  pp.tryReadTemplateToken = function() {
    this.inTemplateElement = true;
    try {
      this.readTmplToken();
    } catch (err) {
      if (err === INVALID_TEMPLATE_ESCAPE_ERROR) {
        this.readInvalidTemplateToken();
      } else {
        throw err
      }
    }

    this.inTemplateElement = false;
  };

  pp.invalidStringToken = function(position, message) {
    if (this.inTemplateElement && this.options.ecmaVersion >= 9) {
      throw INVALID_TEMPLATE_ESCAPE_ERROR
    } else {
      this.raise(position, message);
    }
  };

  pp.readTmplToken = function() {
    var out = "", chunkStart = this.pos;
    for (;;) {
      if (this.pos >= this.input.length) { this.raise(this.start, "Unterminated template"); }
      var ch = this.input.charCodeAt(this.pos);
      if (ch === 96 || ch === 36 && this.input.charCodeAt(this.pos + 1) === 123) { // '`', '${'
        if (this.pos === this.start && (this.type === types$1.template || this.type === types$1.invalidTemplate)) {
          if (ch === 36) {
            this.pos += 2;
            return this.finishToken(types$1.dollarBraceL)
          } else {
            ++this.pos;
            return this.finishToken(types$1.backQuote)
          }
        }
        out += this.input.slice(chunkStart, this.pos);
        return this.finishToken(types$1.template, out)
      }
      if (ch === 92) { // '\'
        out += this.input.slice(chunkStart, this.pos);
        out += this.readEscapedChar(true);
        chunkStart = this.pos;
      } else if (isNewLine(ch)) {
        out += this.input.slice(chunkStart, this.pos);
        ++this.pos;
        switch (ch) {
        case 13:
          if (this.input.charCodeAt(this.pos) === 10) { ++this.pos; }
        case 10:
          out += "\n";
          break
        default:
          out += String.fromCharCode(ch);
          break
        }
        if (this.options.locations) {
          ++this.curLine;
          this.lineStart = this.pos;
        }
        chunkStart = this.pos;
      } else {
        ++this.pos;
      }
    }
  };

  // Reads a template token to search for the end, without validating any escape sequences
  pp.readInvalidTemplateToken = function() {
    for (; this.pos < this.input.length; this.pos++) {
      switch (this.input[this.pos]) {
      case "\\":
        ++this.pos;
        break

      case "$":
        if (this.input[this.pos + 1] !== "{") { break }
        // fall through
      case "`":
        return this.finishToken(types$1.invalidTemplate, this.input.slice(this.start, this.pos))

      case "\r":
        if (this.input[this.pos + 1] === "\n") { ++this.pos; }
        // fall through
      case "\n": case "\u2028": case "\u2029":
        ++this.curLine;
        this.lineStart = this.pos + 1;
        break
      }
    }
    this.raise(this.start, "Unterminated template");
  };

  // Used to read escaped characters

  pp.readEscapedChar = function(inTemplate) {
    var ch = this.input.charCodeAt(++this.pos);
    ++this.pos;
    switch (ch) {
    case 110: return "\n" // 'n' -> '\n'
    case 114: return "\r" // 'r' -> '\r'
    case 120: return String.fromCharCode(this.readHexChar(2)) // 'x'
    case 117: return codePointToString(this.readCodePoint()) // 'u'
    case 116: return "\t" // 't' -> '\t'
    case 98: return "\b" // 'b' -> '\b'
    case 118: return "\u000b" // 'v' -> '\u000b'
    case 102: return "\f" // 'f' -> '\f'
    case 13: if (this.input.charCodeAt(this.pos) === 10) { ++this.pos; } // '\r\n'
    case 10: // ' \n'
      if (this.options.locations) { this.lineStart = this.pos; ++this.curLine; }
      return ""
    case 56:
    case 57:
      if (this.strict) {
        this.invalidStringToken(
          this.pos - 1,
          "Invalid escape sequence"
        );
      }
      if (inTemplate) {
        var codePos = this.pos - 1;

        this.invalidStringToken(
          codePos,
          "Invalid escape sequence in template string"
        );
      }
    default:
      if (ch >= 48 && ch <= 55) {
        var octalStr = this.input.substr(this.pos - 1, 3).match(/^[0-7]+/)[0];
        var octal = parseInt(octalStr, 8);
        if (octal > 255) {
          octalStr = octalStr.slice(0, -1);
          octal = parseInt(octalStr, 8);
        }
        this.pos += octalStr.length - 1;
        ch = this.input.charCodeAt(this.pos);
        if ((octalStr !== "0" || ch === 56 || ch === 57) && (this.strict || inTemplate)) {
          this.invalidStringToken(
            this.pos - 1 - octalStr.length,
            inTemplate
              ? "Octal literal in template string"
              : "Octal literal in strict mode"
          );
        }
        return String.fromCharCode(octal)
      }
      if (isNewLine(ch)) {
        // Unicode new line characters after \ get removed from output in both
        // template literals and strings
        if (this.options.locations) { this.lineStart = this.pos; ++this.curLine; }
        return ""
      }
      return String.fromCharCode(ch)
    }
  };

  // Used to read character escape sequences ('\x', '\u', '\U').

  pp.readHexChar = function(len) {
    var codePos = this.pos;
    var n = this.readInt(16, len);
    if (n === null) { this.invalidStringToken(codePos, "Bad character escape sequence"); }
    return n
  };

  // Read an identifier, and return it as a string. Sets `this.containsEsc`
  // to whether the word contained a '\u' escape.
  //
  // Incrementally adds only escaped chars, adding other chunks as-is
  // as a micro-optimization.

  pp.readWord1 = function() {
    this.containsEsc = false;
    var word = "", first = true, chunkStart = this.pos;
    var astral = this.options.ecmaVersion >= 6;
    while (this.pos < this.input.length) {
      var ch = this.fullCharCodeAtPos();
      if (isIdentifierChar(ch, astral)) {
        this.pos += ch <= 0xffff ? 1 : 2;
      } else if (ch === 92) { // "\"
        this.containsEsc = true;
        word += this.input.slice(chunkStart, this.pos);
        var escStart = this.pos;
        if (this.input.charCodeAt(++this.pos) !== 117) // "u"
          { this.invalidStringToken(this.pos, "Expecting Unicode escape sequence \\uXXXX"); }
        ++this.pos;
        var esc = this.readCodePoint();
        if (!(first ? isIdentifierStart : isIdentifierChar)(esc, astral))
          { this.invalidStringToken(escStart, "Invalid Unicode escape"); }
        word += codePointToString(esc);
        chunkStart = this.pos;
      } else {
        break
      }
      first = false;
    }
    return word + this.input.slice(chunkStart, this.pos)
  };

  // Read an identifier or keyword token. Will check for reserved
  // words when necessary.

  pp.readWord = function() {
    var word = this.readWord1();
    var type = types$1.name;
    if (this.keywords.test(word)) {
      type = keywords[word];
    }
    return this.finishToken(type, word)
  };

  // Acorn is a tiny, fast JavaScript parser written in JavaScript.
  //
  // Acorn was written by Marijn Haverbeke, Ingvar Stepanyan, and
  // various contributors and released under an MIT license.
  //
  // Git repositories for Acorn are available at
  //
  //     http://marijnhaverbeke.nl/git/acorn
  //     https://github.com/acornjs/acorn.git
  //
  // Please use the [github bug tracker][ghbt] to report issues.
  //
  // [ghbt]: https://github.com/acornjs/acorn/issues


  var version = "8.16.0";

  Parser.acorn = {
    Parser: Parser,
    version: version,
    defaultOptions: defaultOptions,
    Position: Position,
    SourceLocation: SourceLocation,
    getLineInfo: getLineInfo,
    Node: Node,
    TokenType: TokenType,
    tokTypes: types$1,
    keywordTypes: keywords,
    TokContext: TokContext,
    tokContexts: types,
    isIdentifierChar: isIdentifierChar,
    isIdentifierStart: isIdentifierStart,
    Token: Token,
    isNewLine: isNewLine,
    lineBreak: lineBreak,
    lineBreakG: lineBreakG,
    nonASCIIwhitespace: nonASCIIwhitespace
  };

  // The main exported interface (under `self.acorn` when in the
  // browser) is a `parse` function that takes a code string and returns
  // an abstract syntax tree as specified by the [ESTree spec][estree].
  //
  // [estree]: https://github.com/estree/estree

  function parse(input, options) {
    return Parser.parse(input, options)
  }

  // This function tries to parse a single expression at a given
  // offset in a string. Useful for parsing mixed-language formats
  // that embed JavaScript expressions.

  function parseExpressionAt(input, pos, options) {
    return Parser.parseExpressionAt(input, pos, options)
  }

  // Acorn is organized as a tokenizer and a recursive-descent parser.
  // The `tokenizer` export provides an interface to the tokenizer.

  function tokenizer(input, options) {
    return Parser.tokenizer(input, options)
  }

  exports.Node = Node;
  exports.Parser = Parser;
  exports.Position = Position;
  exports.SourceLocation = SourceLocation;
  exports.TokContext = TokContext;
  exports.Token = Token;
  exports.TokenType = TokenType;
  exports.defaultOptions = defaultOptions;
  exports.getLineInfo = getLineInfo;
  exports.isIdentifierChar = isIdentifierChar;
  exports.isIdentifierStart = isIdentifierStart;
  exports.isNewLine = isNewLine;
  exports.keywordTypes = keywords;
  exports.lineBreak = lineBreak;
  exports.lineBreakG = lineBreakG;
  exports.nonASCIIwhitespace = nonASCIIwhitespace;
  exports.parse = parse;
  exports.parseExpressionAt = parseExpressionAt;
  exports.tokContexts = types;
  exports.tokTypes = types$1;
  exports.tokenizer = tokenizer;
  exports.version = version;

}));
// END VENDORED ACORN
  return exports;
})();

// 只消除绑定改名和 bunfs 分块路径变化；属性、常量、作用域和执行顺序仍进入签名。
export function structuralModule(source) {
  const ast = cellAst.parse(source, { ecmaVersion: 'latest', sourceType: 'module' });
  const scopes = new WeakMap(), bindings = [], paths = new Map(), internalImports = new WeakSet(), identifiers = [];
  const root = { parent: null, names: new Map(), function: true };
  const children = node => Object.entries(node).flatMap(([key, value]) =>
    ['start', 'end'].includes(key) ? [] : Array.isArray(value)
      ? value.filter(item => item?.type).map(item => [key, item])
      : value?.type ? [[key, value]] : []);
  function bind(pattern, scope) {
    if (!pattern) return;
    if (pattern.type === 'Identifier') {
      if (!scope.names.has(pattern.name)) {
        const id = `binding:${bindings.length}`;
        scope.names.set(pattern.name, id);
        bindings.push(pattern.name);
      }
    } else if (pattern.type === 'RestElement') bind(pattern.argument, scope);
    else if (pattern.type === 'AssignmentPattern') bind(pattern.left, scope);
    else if (pattern.type === 'ArrayPattern') pattern.elements.forEach(item => bind(item, scope));
    else if (pattern.type === 'ObjectPattern') pattern.properties.forEach(item =>
      bind(item.type === 'RestElement' ? item.argument : item.value, scope));
  }
  function collect(node, scope) {
    if (node.type === 'WithStatement' || node.type === 'CallExpression' && node.callee.name === 'eval') {
      throw Error('动态作用域无法安全签名');
    }
    if (['FunctionDeclaration', 'ClassDeclaration'].includes(node.type)) bind(node.id, scope);
    if (['FunctionDeclaration', 'FunctionExpression', 'ArrowFunctionExpression'].includes(node.type)) {
      scope = { parent: scope, names: new Map(), function: true };
      if (node.type === 'FunctionExpression') bind(node.id, scope);
      node.params.forEach(param => bind(param, scope));
    } else if (['BlockStatement', 'CatchClause', 'ForStatement', 'ForInStatement', 'ForOfStatement', 'SwitchStatement', 'ClassExpression', 'ClassDeclaration'].includes(node.type)) {
      scope = { parent: scope, names: new Map() };
      if (node.type === 'ClassExpression') bind(node.id, scope);
      if (node.type === 'CatchClause') bind(node.param, scope);
    }
    scopes.set(node, scope);
    if (node.type === 'ImportDeclaration') node.specifiers.forEach(item => {
      bind(item.local, scope);
      if (/(?:\$bunfs|~BUN)\/root\/[^/]+\.js$/.test(node.source.value)) internalImports.add(item);
    });
    if (node.type === 'VariableDeclaration') {
      let target = scope;
      if (node.kind === 'var') while (!target.function) target = target.parent;
      node.declarations.forEach(item => bind(item.id, target));
    }
    for (const [, child] of children(node)) collect(child, scope);
  }
  collect(ast, root);
  function identifier(node) {
    for (let scope = scopes.get(node); scope; scope = scope.parent) {
      if (scope.names.has(node.name)) return scope.names.get(node.name);
    }
    return `global:${node.name}`;
  }
  function canonical(node, parent, key) {
    if (node.type === 'Identifier') {
      if ((['MemberExpression', 'Property', 'MethodDefinition', 'PropertyDefinition'].includes(parent?.type)
        && key === (parent.type === 'MemberExpression' ? 'property' : 'key') && !parent.computed)) return ['property', node.name];
      if (parent?.type === 'ImportSpecifier' && key === 'imported') {
        if (internalImports.has(parent)) identifiers.push({ start: node.start, end: node.end, name: node.name });
        return ['import', internalImports.has(parent) ? identifier(parent.local) : node.name];
      }
      if (parent?.type === 'ExportSpecifier' && key === 'exported') {
        const resolved = identifier(node);
        if (resolved.startsWith('binding:')) identifiers.push({ start: node.start, end: node.end, name: node.name });
        return ['export', resolved];
      }
      const resolved = identifier(node);
      if (resolved.startsWith('binding:')) identifiers.push({ start: node.start, end: node.end, name: node.name,
        shorthand: parent?.type === 'Property' && parent.shorthand && key === 'value' });
      return ['identifier', resolved];
    }
    const result = {};
    for (const [field, value] of Object.entries(node)) {
      if (['start', 'end', 'raw'].includes(field) || node.type === 'Property' && field === 'shorthand') continue;
      if (node.type === 'Literal' && field === 'value' && key === 'source'
        && typeof value === 'string' && /(?:\$bunfs|~BUN)\/root\/[^/]+\.js$/.test(value)) {
        if (!paths.has(value)) paths.set(value, `chunk:${paths.size}`);
        result[field] = paths.get(value);
      } else result[field] = Array.isArray(value) ? value.map(item => item?.type ? canonical(item, node, field) : item)
        : value?.type ? canonical(value, node, field) : value;
    }
    return result;
  }
  const normalized = JSON.stringify(canonical(ast), (_key, value) => typeof value === 'bigint' ? ['bigint', String(value)]
    : typeof value === 'number' && !Number.isFinite(value) ? ['number', String(value)] : value);
  return { digest: createHash('sha256').update(normalized).digest('hex'), bindings, ast, normalized, identifiers,
    topBindings: Object.fromEntries([...root.names].map(([name, id]) => [name, Number(id.slice(8))])) };
}

const here = realpathSync.native(dirname(fileURLToPath(import.meta.url)));
const src = `${here}/cli.original.js`;
const dst = `${here}/cli.original.cjs`;

// Final runtime directory (~/.clawgod) — passed in by install.sh so that
// native-module / asset / worker paths can be baked as absolute paths.
// Normalise backslashes (Windows argv) to forward slashes: the baked paths
// are spliced into JS string literals, where a raw `\` would be parsed as an
// escape sequence, and Windows filesystem APIs accept forward slashes.
const clawgodDir = realpathSync.native(process.argv[2] || here).replace(/\\/g, '/');

const arch = process.arch === 'arm64' ? 'arm64' : 'x64';
const os = process.platform === 'darwin' ? 'darwin' : process.platform === 'linux' ? 'linux' : 'win32';
const archOs = `${arch}-${os}`;

// Bun standalone embeds are referenced as /$bunfs/root/... (POSIX) or
// B:/~BUN/root/... (Windows). Match both prefixes so every reference is
// rewritten regardless of which build produced the binary.
const BUNFS = String.raw`(?:[A-Za-z]:)?\/(?:\$bunfs|~BUN)\/root\/`;

// 提取的文本在原生 bundle 中是字符串，Bun 的磁盘 loader 却返回模块 namespace。
function fixTextRequires(code) {
  const textRoot = JSON.stringify(join(clawgodDir, 'assets'));
  return code.replace(/\b([\w$]+)=import\.meta\.require(?=[,;])/g, (_match, name) =>
    `${name} = (id) => {
      if (/\\.(?:txt|md)$/.test(id)) {
        const fs = import.meta.require('node:fs');
        const path = import.meta.require('node:path');
        if (fs.existsSync(${textRoot})) {
          const target = fs.realpathSync.native(path.isAbsolute(id) ? id : import.meta.require.resolve(id));
          const relative = path.relative(fs.realpathSync.native(${textRoot}), target);
          if (relative !== '..' && !relative.startsWith('..' + path.sep) && !path.isAbsolute(relative)) {
            return fs.readFileSync(target, 'utf8');
          }
        }
      }
      return import.meta.require(id);
    }`,
  );
}

function rewrite(code, { chunkPrefix }) {
  // (1) code-split chunk import specifiers → local relative path.
  // v2.1.246 renamed many chunks from `chunk-<hash>.js` to `_<n>.js`; both
  // are flat files under chunks/ and must be rewritten to local paths.
  code = code.replace(
    new RegExp(`${BUNFS}(chunk-[a-z0-9]+|_[0-9]+)\\.js`, 'g'),
    (match, name) => `${chunkPrefix}${name}.js`,
  );
  // (2) native .node module path (string arg to import.meta.require) → vendor.
  code = code.replace(
    new RegExp(`${BUNFS}([\\w-]+)\\.node`, 'g'),
    (m, name) => `${clawgodDir}/vendor/${name}/${archOs}/${name}.node`,
  );
  // (3) loader=file assets (design-canvas payload, chart/hljs/mermaid) → assets/.
  code = code.replace(
    new RegExp(`${BUNFS}([A-Za-z0-9_.-]+\\.(?:asset|min\\.js|md|txt))`, 'g'),
    (m, name) => `${clawgodDir}/assets/${name}`,
  );
  // (4) plugin function-hooks worker URL → local worker file.
  code = code.replace(
    new RegExp(`${BUNFS}src/plugins/functionHooks/hooks-worker/hooks-worker\\.js`, 'g'),
    `${clawgodDir}/chunks/hooks-worker.js`,
  );
  return fixTextRequires(code);
}

// ── 公开 Bun 的字符格渲染器 ────────────────────────────────────────────────
// Claude Code 2.1.269 起，Ink 的文本行绘制改由私有 Bun 内建的
// Bun.ant.CellSegmenter 完成：它按字素切分、算显示宽度、并把结果直接写进
// 屏幕字符格。官方二进制自带该内建模块，公开 Bun（stable 与 canary）都没有。
// ClawGod 用公开 Bun 运行提取出来的 JS，所以这里补一组等价实现，只替换真正
// 调用内建的四处代码，其余渲染、React 与布局逻辑原样保留。
//
// 字符格布局与上游一致（同一个 Int32Array，每格两个 i32：字符池下标 +
// styleId<<17 | hyperlinkId<<2 | width），因此 setCell 与行绘制可以接进上游
// 的 damage / atlasRecorder / 样式池流程。ANSI 分词（cmr）、样式合并（Kf）、
// 控制字符净化（Dc）与颜色归一化（MNr/LNr）都复用同分块已有实现。
export const CELL_RENDERER_SOURCE = `
// ClawGod: public-Bun replacement for the private cell segmenter renderer.
// Only the cell writer and the line painter are reimplemented; the
// packed cell layout, damage rectangles, atlas recording and style pool are
// untouched, so the rest of the renderer keeps working as upstream.
// ponytail: RTL reordering is not ported. On Windows Terminal and VS Code,
// the only hosts that request it, Arabic and Hebrew render in logical order.
// Upgrade path: compute embedding levels (a UBA implementation such as the
// MIT-licensed bidi-js) and reverse the grapheme runs above each level.
var clawgodCacheLimit = 512;
var clawgodOsc8Prefix = String.fromCharCode(27) + "]8;;";
var clawgodSgr = /^\\x1b\\[[0-9;]*m$/;
var clawgodAmbiguousNarrow = { ambiguousIsNarrow: true };
var clawgodSegmenter;
function clawgodGraphemes(text) {
  if (clawgodSegmenter === void 0) {
    clawgodSegmenter = new Intl.Segmenter(void 0, { granularity: "grapheme" });
  }
  return clawgodSegmenter.segment(text);
}
function clawgodCsiEnd(text, start) {
  for (var index = start; index < text.length; index++) {
    var code = text.charCodeAt(index);
    if (code >= 64 && code <= 126) return index;
  }
  return -1;
}
function clawgodOscEnd(text, start) {
  for (var index = start; index < text.length; index++) {
    var code = text.charCodeAt(index);
    if (code === 7) return index;
    if (code === 27 && text.charCodeAt(index + 1) === 92) return index;
  }
  return -1;
}
// Only SGR and OSC 8 survive. Anything else would reach the terminal verbatim,
// which is how a rendered string turns into an injected escape sequence.
function sanitizeControlSequences(text) {
  var out = "";
  for (var index = 0; index < text.length; index++) {
    var code = text.charCodeAt(index);
    if (code === 27 || code === 155) {
      if (code === 155) {
        var eightBit = clawgodCsiEnd(text, index + 1);
        if (eightBit >= 0) {
          var normalized = String.fromCharCode(27) + "[" + text.slice(index + 1, eightBit + 1);
          if (clawgodSgr.test(normalized)) out += normalized;
          index = eightBit;
        }
        continue;
      }
      var next = text.charAt(index + 1);
      if (next === "[") {
        var csi = clawgodCsiEnd(text, index + 2);
        if (csi >= 0) {
          var sequence = text.slice(index, csi + 1);
          if (clawgodSgr.test(sequence)) out += sequence;
          index = csi;
        }
        continue;
      }
      if (next === "]") {
        var osc = clawgodOscEnd(text, index + 2);
        if (osc >= 0) {
          var body = text.slice(index + 2, osc);
          var separator = body.indexOf(";", 2);
          if (body.slice(0, 2) === "8;" && separator >= 0) {
            var uri = body.slice(separator + 1);
            out += clawgodOsc8Prefix + uri + String.fromCharCode(7);
          }
          index = text.charCodeAt(osc) === 27 ? osc + 1 : osc;
        }
        continue;
      }
      if (next === "(" || next === ")" || next === "*" || next === "+") index += 2;
      continue;
    }
    if (code === 9) {
      out += text.charAt(index);
      continue;
    }
    if (code < 32 || code === 127) continue;
    out += text.charAt(index);
  }
  return Dc(out);
}
// Style runs are merged before grapheme segmentation, exactly like upstream:
// every grapheme that shares a style run shares one interned style id.
function parseStyledText(text, stylePool) {
  var cells = [];
  var styles = [];
  var hyperlink;
  var run = "";
  function flush() {
    if (run === "") return;
    var styleId = stylePool.intern(MNr(LNr(styles)));
    for (var segment of clawgodGraphemes(run)) {
      var value = segment.segment;
      cells.push({
        value: value,
        width: Bun.stringWidth(value, clawgodAmbiguousNarrow),
        styleId: styleId,
        hyperlink: hyperlink,
      });
    }
    run = "";
  }
  for (var token of cmr(text)) {
    if (token.type === "char") {
      run += token.value;
      continue;
    }
    var code = token.code;
    if (code.slice(0, clawgodOsc8Prefix.length) === clawgodOsc8Prefix) {
      flush();
      var uri = code.slice(clawgodOsc8Prefix.length, -1);
      hyperlink = uri === "" ? void 0 : uri;
      continue;
    }
    if (!clawgodSgr.test(code)) continue;
    flush();
    styles = Kf(styles, [token]);
  }
  flush();
  return cells;
}
function packCell(styleId, hyperlinkId, width) {
  return jn(styleId, hyperlinkId, width);
}
function unionDamage(first, second) {
  var x = Math.min(first.x, second.x);
  var y = Math.min(first.y, second.y);
  var right = Math.max(first.x + first.width, second.x + second.width);
  var bottom = Math.max(first.y + first.height, second.y + second.height);
  return { x: x, y: y, width: right - x, height: bottom - y };
}
function writeCell(screen, x, y, cell) {
  if (x < 0 || y < 0 || x >= screen.width || y >= screen.height) return;
  var cells = screen.cells;
  var index = (y * screen.width + x) << 1;
  var previous = cells[index + 1] & bn;
  var left = x;
  var right = x;
  if (previous === 1 && cell.width !== 1 && x + 1 < screen.width) {
    var orphanTail = index + 2;
    if ((cells[orphanTail + 1] & bn) === 2) {
      cells[orphanTail] = wo;
      cells[orphanTail + 1] = packCell(screen.emptyStyleId, 0, 0);
      right = x + 1;
    }
  }
  if (previous === 2 && cell.width !== 2 && x > 0) {
    var orphanHead = index - 2;
    if ((cells[orphanHead + 1] & bn) === 1) {
      cells[orphanHead] = wo;
      cells[orphanHead + 1] = packCell(screen.emptyStyleId, 0, 0);
      left = x - 1;
    }
  }
  cells[index] = Rx(screen, cell.char);
  cells[index + 1] = packCell(cell.styleId, xx(screen, cell.hyperlink), cell.width);
  if (screen.atlasRecorder.recording) screen.atlasRecorder.record(cells[index], cell.styleId);
  if (cell.width === 1 && x + 1 < screen.width) {
    var tail = index + 2;
    if ((cells[tail + 1] & bn) === 1 && x + 2 < screen.width) {
      var orphan = tail + 2;
      if ((cells[orphan + 1] & bn) === 2) {
        cells[orphan] = wo;
        cells[orphan + 1] = packCell(screen.emptyStyleId, 0, 0);
      }
    }
    cells[tail] = Xf;
    cells[tail + 1] = packCell(screen.emptyStyleId, 0, 2);
    right = x + 1;
  }
  var damage = { x: left, y: y, width: right - left + 1, height: 1 };
  screen.damage = screen.damage ? unionDamage(screen.damage, damage) : damage;
}
function paintCells(screen, cells, x, y) {
  var column = x;
  var blank = { char: " ", styleId: screen.emptyStyleId, width: 0, hyperlink: void 0 };
  for (var index = 0; index < cells.length; index++) {
    var cell = cells[index];
    var code = cell.value.charCodeAt(0);
    if (code <= 31) {
      if (code !== 9) continue;
      blank.char = " ";
      blank.styleId = screen.emptyStyleId;
      blank.width = 0;
      blank.hyperlink = void 0;
      var stop = hht - column % hht;
      for (var step = 0; step < stop && column < screen.width; step++) {
        writeCell(screen, column++, y, blank);
      }
      continue;
    }
    if (cell.width === 0) continue;
    var wide = cell.width >= 2;
    if (wide && column + cell.width > screen.width) {
      blank.char = " ";
      blank.styleId = screen.emptyStyleId;
      blank.width = 3;
      blank.hyperlink = void 0;
      writeCell(screen, column++, y, blank);
      continue;
    }
    blank.char = cell.value;
    blank.styleId = cell.styleId;
    blank.hyperlink = cell.hyperlink;
    blank.width = wide ? 1 : 0;
    writeCell(screen, column, y, blank);
    for (var offset = 2; offset < cell.width; offset++) {
      blank.char = "";
      blank.width = 2;
      writeCell(screen, column + offset, y, blank);
    }
    column += wide ? cell.width : 1;
  }
  return column;
}
function Ns() {
  throw new Error("ClawGod replaced the private cell segmenter with a public-Bun renderer; this path must not run.");
}
`;

export const CELL_LINE_CELLS_SOURCE = `
class Dd {
  constructor(stylePool, charPool) {
    this.stylePool = stylePool;
    this.charPool = charPool;
    this.cells = [];
    this.count = 0;
    this.cache = new Map();
    this.styleGeneration = stylePool.generation;
    this.chalkGeneration = bGt();
  }
  parse(text) {
    var chalkGeneration = bGt();
    if (this.styleGeneration !== this.stylePool.generation || this.chalkGeneration !== chalkGeneration) {
      this.cache.clear();
      this.styleGeneration = this.stylePool.generation;
      this.chalkGeneration = chalkGeneration;
    }
    var cached = this.cache.get(text);
    if (cached !== void 0) {
      this.cache.delete(text);
      this.cache.set(text, cached);
      return cached;
    }
    var parsed = parseStyledText(sanitizeControlSequences(text), this.stylePool);
    if (this.cache.size >= clawgodCacheLimit) this.cache.delete(this.cache.keys().next().value);
    this.cache.set(text, parsed);
    return parsed;
  }
  segment(text) {
    this.cells = this.parse(text);
    this.count = this.cells.length;
    return this.count;
  }
  keepColumns(start, left, right) {
    var column = start;
    var first = Math.max(start, left);
    var kept = [];
    for (var index = 0; index < this.count; index++) {
      var cell = this.cells[index];
      var end = column + (cell.value.charCodeAt(0) === 9 ? hht - column % hht : cell.width);
      if (column >= left && column < right && end <= right) {
        if (kept.length === 0) first = column;
        kept.push(cell);
      }
      column = end;
    }
    this.cells = kept;
    this.count = kept.length;
    return first;
  }
  trailingSpaces() {
    var count = 0;
    while (count < this.count && this.cells[this.count - 1 - count].value === " ") count++;
    return count;
  }
  width(text, start) {
    var column = start;
    var cells = this.segment(text) ? this.cells : [];
    for (var index = 0; index < cells.length; index++) {
      var cell = cells[index];
      column += cell.value.charCodeAt(0) === 9 ? hht - column % hht : cell.width;
    }
    return column - start;
  }
  paint(screen, text, x, y) {
    return paintCells(screen, this.parse(text), x, y);
  }
}
`;

export const CELL_SET_CELL_SOURCE =
  'function Cx(screen,x,y,cell){return writeCell(screen,x,y,cell)}';

export const CELL_WRITE_LINE_SOURCE =
  'function xC(screen,text,x,y,lineCells){return lineCells.paint(screen,text,x,y)}';

// Public Bun.sliceAnsi measures a tab as zero width, so a clipped line that
// contains tabs collapses to nothing. Expand tabs against the line's real
// starting column first, using the same helper the renderer already imports.
const TAB_CLIP_ANCHOR = 'let ge=Dc(oe),ve=U.x2-B';
const TAB_CLIP_REPLACEMENT = 'let ge=Dc(oe);if(ge.indexOf(String.fromCharCode(9))>=0){'
  + 'let q=((B%hht)+hht)%hht;ge=C8(" ".repeat(q)+ge).slice(q)}let ve=U.x2-B';

// Frozen 2.1.274 shapes. Each entry is a declaration header that must be
// unique in the module plus the sha256 of that whole declaration. Anything
// else is treated as an unknown renderer and never rewritten.
export const CELL_SEGMENTER_SHAPE = Object.freeze([
  Object.freeze({ header: 'function Ns(n){', digest: '4e5755f6fa041bc684ece0de64ec2fab3ae64af71d8794b224b7516900621313' }),
  Object.freeze({ header: 'class Dd{', digest: 'a6c1f5e8fff998da5a9a47d7cb327decbb1f9f2ec41cffabafdd0c16977ec649' }),
  Object.freeze({ header: 'function Cx(n,s,u,f){', digest: 'b63f741c88dd98285e657d3e7f189a97f42b1fb3a2e2ec38aa2eb54ad92e4343' }),
  Object.freeze({ header: 'function xC(n,s,u,f,h){', digest: '575897d7252184a58fe852df1f67980083c456e82f42628568c2fbc4b9a03d73' }),
  Object.freeze({ header: 'function cmr(n,s=Number.POSITIVE_INFINITY){', digest: '29b1446b9ad065df93b7bcb55a3230d5f17d7ae36c8081b2dc1ea78c8df4dcfc' }),
  Object.freeze({ header: 'function Kf(n,s){', digest: 'bd9156be1dfb7d9044dd6aaffaacbc57ede60330c22c4aae38d5acc262f75cd1' }),
  Object.freeze({ header: 'function Dc(n){', digest: '2fb9fb7059ede30d487c8e40929369d743bb23bfb5771435c16b6e18283a2924' }),
]);

// The renderer also leans on these module-level bindings. They are checked by
// name so a renamed or removed import fails closed instead of at runtime.
const CELL_SEGMENTER_BINDINGS = Object.freeze(['hht', 'C8', 'MNr', 'LNr', 'bGt']);
const OSC8_DECLARATION = 'var Ss="\\x1B]8;;"';

// 同版本跨平台会重命名压缩标识符。只映射注入源码，绝不重命名上游模块；
// 每个平台仍须通过完整声明的 SHA-256 校验，而不是依赖运行机器的平台。
const CELL_PLATFORM_SHAPES = [
  {
    shape: CELL_SEGMENTER_SHAPE,
    names: {},
    tabAnchor: TAB_CLIP_ANCHOR,
    tabReplacement: TAB_CLIP_REPLACEMENT,
  },
  {
    shape: [
      { header: 'function Ns(n){', digest: 'ac30ce81cada59843be0fa495b883808c0c4338bfe199d068e9ed5eab5062e74' },
      { header: 'class Dd{', digest: '7bed0618f1608b4b221fefa36167bb319d0c9f5cd2cd4d819277b89d7bbe1903' },
      { header: 'function xx(n,s,u,f){', digest: 'deac5d3bb248a2fd8dbdd347f4e1024ddef40623eb5b13fd7a60ddbc2c528925' },
      { header: 'function SC(n,s,u,f,m){', digest: 'bb6854b10f0e6846cfcf1af6749b3b185f171370589b580a2ea1948dd22310f5' },
      { header: 'function qmr(n,s=Number.POSITIVE_INFINITY){', digest: '59a3a009130c86c7223ce4ff3c8f24c9b71727cf157199cb24c9b8337cd5e42d' },
      { header: 'function Kf(n,s){', digest: '833c8aba97c1c5351305daabf62c531b87b37f9da291fa067416c99332cdf285' },
      { header: 'function Dc(n){', digest: 'b906f74a22265209d7f233e752a1b43bc1b5172fd7dc8d1028ef90f928805658' },
    ],
    names: { Cx: 'xx', xC: 'SC', cmr: 'qmr', Rx: 'Cx', xx: 'Ex', hht: 'nht', C8: '_Y', MNr: 'LVn', LNr: 'wdt', bGt: 'nqt' },
    tabAnchor: 'let be=Dc(oe),ge=F.x2-w',
    tabReplacement: 'let be=Dc(oe);if(be.indexOf(String.fromCharCode(9))>=0){let q=((w%nht)+nht)%nht;be=_Y(" ".repeat(q)+be).slice(q)}let ge=F.x2-w',
  },
  {
    shape: [
      { header: 'function Ns(n){', digest: '736a25ec268896d71d07162d41f0d171a6eac36db7902a2f07bbcde9f8ceed5d' },
      { header: 'class Dd{', digest: '77c3b10775ae166bf39189f35445bac7d3b0a1afc92ddc5ba3e4998fcb7b5e87' },
      { header: 'function Rx(n,s,u,f){', digest: '96c198edfb189f58e281309e2820ecb8e82d86a90f4b682ba124f71190e2f045' },
      { header: 'function CC(n,s,u,f,h){', digest: '8a4b8e4f74ae43c7e26c9337de933ead26d765b64f863ff3675a948ed600863b' },
      { header: 'function Jmr(n,s=Number.POSITIVE_INFINITY){', digest: 'b6efb306c3b5a4a2a7fe779f214f8747a08cf149d3fce068802c2580f35085ab' },
      { header: 'function Kf(n,s){', digest: '7696e200d0fdf7b4c84049db7941177071620a5c6b68272fae60f5ebf0d41db1' },
      { header: 'function Dc(n){', digest: '55e89daf20204474e099191c0f4d1a843cf51c94fbd569f4051c69b7bc726149' },
    ],
    names: { Cx: 'Rx', xC: 'CC', cmr: 'Jmr', Rx: 'Mx', xx: 'Cx', hht: 'tht', C8: 'v8', MNr: 'zVn', LNr: 'vdt', bGt: 'oqt' },
    tabAnchor: 'let be=Dc(oe),ge=L.x2-H',
    tabReplacement: 'let be=Dc(oe);if(be.indexOf(String.fromCharCode(9))>=0){let q=((H%tht)+tht)%tht;be=v8(" ".repeat(q)+be).slice(q)}let ge=L.x2-H',
  },
  // 2.1.276 darwin
  {
    shape: [
      { header: 'function Ss(n){', digest: 'a0dd4522389a8dc1967f76410f73889df40bdf86f47e95cd08d6d0673018b9dd' },
      { header: 'class Cd{', digest: '00fdec476f2ad30e68b1594fad389af0be769b0a9ffaceac093f6f773eaad1ef' },
      { header: 'function cx(n,s,u,f){', digest: '551fdb0cb11d12cab8e0396011a0a0149f3fcfcf3f2689d810df561d48716037' },
      { header: 'function cC(n,s,u,f,m){', digest: 'd3381a42bb35979e80423552684344b3903928fd7017af1504e3f424a86b41db' },
      { header: 'function _br(n,s=Number.POSITIVE_INFINITY){', digest: 'fcf061b6dfef0ef35dc17cc5d65bcaa25defad452f687dc78b7efe93bce698e3' },
      { header: 'function Lf(n,s){', digest: '20026d512dbaf213e8b6886de96427524a408b128630cf018a1663a93153ffec' },
      { header: 'function xc(n){', digest: '43b72b923bf142999721ae83f4750b4068e184b05835b6d0e90fc11d7675d332' },
    ],
    names: { Ns: 'Ss', Dd: 'Cd', Cx: 'cx', xC: 'cC', cmr: '_br', Kf: 'Lf', Dc: 'xc', bn: 'gn', wo: 'Ho', Xf: 'Kf', Rx: 'fx', xx: 'ux', hht: 'j_t', C8: 'uY', MNr: 'g2r', LNr: 'h2r', bGt: 'mqt' },
    oscDeclaration: 'var ys="\\x1B]8;;"',
    tabAnchor: 'let fe=xc(oe),ge=U.x2-H',
    tabReplacement: 'let fe=xc(oe);if(fe.indexOf(String.fromCharCode(9))>=0){let q=((H%j_t)+j_t)%j_t;fe=uY(" ".repeat(q)+fe).slice(q)}let ge=U.x2-H',
  },
  // 2.1.276 linux
  {
    shape: [
      { header: 'function Ss(n){', digest: 'a8789e212cdc179cb9dcab6d0b151df1e54374f229abf06269d8af3dfa2608e3' },
      { header: 'class Cd{', digest: 'da7e444b7296895b90e3e95e3e95119eec19f9030cc6857db42c4bfc892777b8' },
      { header: 'function ax(n,s,u,f){', digest: '07bbebc3e21c46baaf7c5852eefcd63c69e253e3c4608774e7171dd15a544040' },
      { header: 'function uC(n,s,u,f,m){', digest: '17493b884635fc837b3f66dd2eaae3ffa99f758080e8e229e47b0ae24f4e1a5d' },
      { header: 'function Wbr(n,s=Number.POSITIVE_INFINITY){', digest: '825eda9f6c8a22e2090a41d5b1df77d96e74024840bd2239e86186aef6e0b493' },
      { header: 'function Lf(n,s){', digest: 'd8a635ea00ff8f6b75098bdea95b0a4e683f4e7e26440b65dbce03a5524dad22' },
      { header: 'function xc(n){', digest: 'b7d454b07e4d7443691841d0bbfbf998743050241f8a8f6dba819fdf69eff375' },
    ],
    names: { Ns: 'Ss', Dd: 'Cd', Cx: 'ax', xC: 'uC', cmr: 'Wbr', Kf: 'Lf', Dc: 'xc', bn: 'gn', wo: 'Bo', Xf: 'Kf', Rx: 'sx', xx: 'rx', hht: 'R_t', C8: 'r9', MNr: 'LBr', LNr: 'DBr', bGt: 'X4t' },
    oscDeclaration: 'var ys="\\x1B]8;;"',
    tabAnchor: 'let fe=xc(oe),ge=P.x2-B',
    tabReplacement: 'let fe=xc(oe);if(fe.indexOf(String.fromCharCode(9))>=0){let q=((B%R_t)+R_t)%R_t;fe=r9(" ".repeat(q)+fe).slice(q)}let ge=P.x2-B',
  },
  // 2.1.276 win32
  {
    shape: [
      { header: 'function Ss(n){', digest: '4dc4fb9aec1e8d12f2142a2e3af9592e8eee119c0e5574d8000244527b3ce6ef' },
      { header: 'class Cd{', digest: '05def87fb3a883645f33f12486e5e529b7ab519173d7f890b2733675dc6258d2' },
      { header: 'function ux(n,s,u,f){', digest: '7b878069aae21e0c2e94304adfcd4bb225a7217b0d0343cb8dc35b5c94d007ba' },
      { header: 'function uC(n,s,u,f,m){', digest: '3f43193067f814623bf3a7b97d60e15eef7ca6990204fb562702c9591c6e17a8' },
      { header: 'function Ybr(n,s=Number.POSITIVE_INFINITY){', digest: '0d3186c7f2bf757c66164290f4a839f76a3e25547f392972da8ef7b56b5e0b89' },
      { header: 'function Lf(n,s){', digest: '60da48ed9f91315e49151c21cbbd6b219fba63d2db6c8e9a0159888e07e69ebd' },
      { header: 'function xc(n){', digest: 'edc201f072ecabe926a01ecda3ed3abe904fb2e0be9bb7e86fe796b08e73af19' },
    ],
    names: { Ns: 'Ss', Dd: 'Cd', Cx: 'ux', xC: 'uC', cmr: 'Ybr', Kf: 'Lf', Dc: 'xc', bn: 'gn', wo: 'Ho', Xf: 'Kf', Rx: 'cx', xx: 'sx', hht: 'R_t', C8: 'l9', MNr: '$Br', LNr: 'FBr', bGt: 'e3t' },
    oscDeclaration: 'var ys="\\x1B]8;;"',
    tabAnchor: 'let fe=xc(oe),ge=U.x2-H',
    tabReplacement: 'let fe=xc(oe);if(fe.indexOf(String.fromCharCode(9))>=0){let q=((H%R_t)+R_t)%R_t;fe=l9(" ".repeat(q)+fe).slice(q)}let ge=U.x2-H',
  },
  // 2.1.278 darwin
  {
    shape: [
      { header: 'function vs(n){', digest: 'd4a8296094cac9707122b9e5460138ae8b0c3f9194e3185e141db1216ca70cfc' },
      { header: 'class Mf{', digest: '134c725be2ec7ec795ad0ca288e0671abdfabda01fcce28e1370b47069096721' },
      { header: 'function px(n,s,u,f){', digest: '6fed0460bd35861f2649f88e19c888f6051aa8b8ed05f4e2f6b0854af10d41d1' },
      { header: 'function xC(n,s,u,f,m){', digest: '74f0a5164e92d9e99518b27ff2d9007552c0c1627eb5b7fac281e5fe7756a2b8' },
      { header: 'function bCr(n,s=Number.POSITIVE_INFINITY){', digest: '857ed54815e1d96529dc71cf7f4d9655613aadbeecfc3a10885b3b0ecbc8e43d' },
      { header: 'function Bd(n,s){', digest: 'd37554a039a8c7364ee2ff7d6ff28bb15920c627ecfb909de192406c1c5e7c78' },
      { header: 'function Ec(n){', digest: 'cd3da2b7dc88940ea34fc9da20134e596a9e4dbcd1f39238d8aad7199e82fe8c' },
    ],
    names: { Ns: 'vs', Dd: 'Mf', Cx: 'px', xC: 'xC', cmr: 'bCr', Kf: 'Bd', Dc: 'Ec', bn: 'gn', wo: 'Ho', Xf: 'kd', Rx: 'yx', xx: 'mx', hht: 'cwt', C8: 'fX', MNr: 'bzr', LNr: 'wzr', bGt: 'T5t' },
    oscDeclaration: 'var ys="\\x1B]8;;"',
    tabAnchor: 'let fe=Ec(oe),ge=F.x2-H',
    tabReplacement: 'let fe=Ec(oe);if(fe.indexOf(String.fromCharCode(9))>=0){let q=((H%cwt)+cwt)%cwt;fe=fX(" ".repeat(q)+fe).slice(q)}let ge=F.x2-H',
  },
  // 2.1.278 linux
  {
    shape: [
      { header: 'function Ss(n){', digest: '0634b77a7740a9fcde19c3985049d09b24618d1b5baee2e60a65ff90e8215e00' },
      { header: 'class Rf{', digest: '3e9a874886729829a6e370f9d6ecc83a888c1d2eb0f2ffd6273d464464be6956' },
      { header: 'function hx(n,s,u,f){', digest: '820518bd51fa6bc8177cfb53fc0ffde817122bfdaed171895a220ae552f53b63' },
      { header: 'function xC(n,s,u,f,m){', digest: '21bfc2d2353fb3ef83d702a609b6f592dcd742d3a2ef9170ba2417610d2893f6' },
      { header: 'function ckr(n,s=Number.POSITIVE_INFINITY){', digest: '3473ce0607774850f4803c3b31d478a6ead374ce5dfd6f93fdfc4c77f43f3589' },
      { header: 'function Bd(n,s){', digest: '2c8459be8474405142e31e0dfc24151411ace0cb7e6e6c28dc0b961aa2deadf0' },
      { header: 'function xc(n){', digest: 'c0b05868714c4c6446bedf98f853769dd91c76c3fde53648567e2f2f6c20c48c' },
    ],
    names: { Ns: 'Ss', Dd: 'Rf', Cx: 'hx', xC: 'xC', cmr: 'ckr', Kf: 'Bd', Dc: 'xc', bn: 'gn', wo: 'Bo', Xf: 'kd', Rx: 'mx', xx: 'fx', hht: 'YSt', C8: 'iX', MNr: 'FGr', LNr: 'UGr', bGt: 'l8t' },
    oscDeclaration: 'var gs="\\x1B]8;;"',
    tabAnchor: 'let fe=xc(oe),ge=L.x2-B',
    tabReplacement: 'let fe=xc(oe);if(fe.indexOf(String.fromCharCode(9))>=0){let q=((B%YSt)+YSt)%YSt;fe=iX(" ".repeat(q)+fe).slice(q)}let ge=L.x2-B',
  },
  // 2.1.278 win32
  {
    shape: [
      { header: 'function Ss(n){', digest: 'b72e953d299ddf87ee7906bc25cb673fe56a2f54f6ee57e726a893981e43e0d8' },
      { header: 'class Mf{', digest: '27fe1ba7d7289fafac5ae625645228a8eb1c343f839a23d6b927e2fa484a3bb9' },
      { header: 'function px(n,s,u,f){', digest: '0fa001b973bafe1401fd0fe20d57103a567428bd2dec5f0ef98c95d1176cb422' },
      { header: 'function EC(n,s,u,f,m){', digest: 'b5c9f67c07cc451feeb200cf93cdca3c6d07e1557a66151b39cbeb3725c3d4e8' },
      { header: 'function mkr(n,s=Number.POSITIVE_INFINITY){', digest: 'c9855fa3632f839f5955da35f7a6522e6041afd7e6b79918ad025b92726d6b1c' },
      { header: 'function Bd(n,s){', digest: '9b1427b49efb55c454c6c935d2c62bb145184d0f55214c3ea8ce399cd6622935' },
      { header: 'function Ec(n){', digest: '7008506e2fe7aa92fa08c1c468397756e853d7bdf8c15a6c68cf99da7bbdb4dc' },
    ],
    names: { Ns: 'Ss', Dd: 'Mf', Cx: 'px', xC: 'EC', cmr: 'mkr', Kf: 'Bd', Dc: 'Ec', bn: 'gn', wo: 'Ho', Xf: 'kd', Rx: 'yx', xx: 'mx', hht: 'YSt', C8: 'uX', MNr: 'zGr', LNr: 'WGr', bGt: 'pYt' },
    oscDeclaration: 'var gs="\\x1B]8;;"',
    tabAnchor: 'let fe=Ec(oe),ge=F.x2-H',
    tabReplacement: 'let fe=Ec(oe);if(fe.indexOf(String.fromCharCode(9))>=0){let q=((H%YSt)+YSt)%YSt;fe=uX(" ".repeat(q)+fe).slice(q)}let ge=F.x2-H',
  },
  // 2.1.280 darwin
  {
    shape: [
      { header: 'function gs(n){', digest: '451500eeb2148705f8efb2c6f462a4694d35db36e8a58249e5e8bcf43797a2ad' },
      { header: 'class Kd{', digest: '4a95b3099242d27d4a1f3368c69b2369e185abc422dcfc5799018c8452906388' },
      { header: 'function WE(n,s,u,f){', digest: '8ad35a3ee724264f7d7864935000c0006feedc300a40ad1e4f982c7611131b19' },
      { header: 'function $x(n,s,u,f,m){', digest: 'a170ead8f986ec28ddeacd93f1490a957866dcf321ccb0bc5f8d182d6596c07a' },
      { header: 'function UMr(n,s=Number.POSITIVE_INFINITY){', digest: '3a703d643b7b327d93744ac87f44b91ce6a42811266b121eb9800533dd0c9148' },
      { header: 'function ud(n,s){', digest: 'f8d29d2b93f36ba509529c3c3622438cbedea3495018f8d51e373296dbbc2306' },
      { header: 'function gc(n){', digest: 'fee256ff9a34ed06a504164cc065414a5c334259f6ff1f90a96e36d700b31208' },
    ],
    names: { Ns: 'gs', Dd: 'Kd', Cx: 'WE', xC: '$x', cmr: 'UMr', Kf: 'ud', Dc: 'gc', bn: 'gn', wo: 'Do', Xf: 'pd', jn: 'Yn', Rx: 'qE', xx: 'jE', hht: 'ITt', C8: 'eJ', MNr: 'WXr', LNr: 'GXr', bGt: 'QZt' },
    oscDeclaration: 'var ms="\\x1B]8;;"',
    tabAnchor: 'let fe=gc(oe),ge=F.x2-H',
    tabReplacement: 'let fe=gc(oe);if(fe.indexOf(String.fromCharCode(9))>=0){let q=((H%ITt)+ITt)%ITt;fe=eJ(" ".repeat(q)+fe).slice(q)}let ge=F.x2-H',
  },
  // 2.1.280 linux
  {
    shape: [
      { header: 'function gs(n){', digest: '6763991fc5b3df480c2dbf79f805a87c753c1b0bb15419b2aa1a1b11473009f2' },
      { header: 'class Kd{', digest: 'd0409e7aa3498854187ed619ed7f298f580f26acf778719f50916e3c70ffa203' },
      { header: 'function IE(n,s,u,f){', digest: '946b728782e4f0af594653a125a01fc96dece05cbd302693511cb3f86bd807c3' },
      { header: 'function Qx(n,s,u,f,m){', digest: 'b78125da953622f610cae658a8dc00cb95c0976efd1db8343c79490145841ecf' },
      { header: 'function pLr(n,s=Number.POSITIVE_INFINITY){', digest: '3098b06aad5590987e5c7deb10540401bceca300517d3df03116f21c01d06b9f' },
      { header: 'function ud(n,s){', digest: 'dfbad4e6a5fd98ae20c0f403e57f3e1ca8478a2d25c22e20ea3f972070b9d066' },
      { header: 'function gc(n){', digest: '98db97d40a90642343d59bc908e66b1b50ef8e6e4bc850bfd95a36abd70b965a' },
    ],
    names: { Ns: 'gs', Dd: 'Kd', Cx: 'IE', xC: 'Qx', cmr: 'pLr', Kf: 'ud', Dc: 'gc', bn: 'gn', wo: 'No', Xf: 'pd', jn: 'Yn', Rx: 'KE', xx: 'kE', hht: 'yTt', C8: 'VJ', MNr: 'sXr', LNr: 'iXr', bGt: 'DZt' },
    oscDeclaration: 'var ms="\\x1B]8;;"',
    tabAnchor: 'let fe=gc(oe),ge=L.x2-B',
    tabReplacement: 'let fe=gc(oe);if(fe.indexOf(String.fromCharCode(9))>=0){let q=((B%yTt)+yTt)%yTt;fe=VJ(" ".repeat(q)+fe).slice(q)}let ge=L.x2-B',
  },
  // 2.1.280 win32
  {
    shape: [
      { header: 'function gs(n){', digest: '73e2f2b383b85627c5e55c4e655693826e1ccb51de1993ef14acfca15984afae' },
      { header: 'class Kd{', digest: 'b4413fb01fca4840d1ab17e566c666215192bf15ed74f9615c2d9a5d305a9d53' },
      { header: 'function IE(n,s,c,f){', digest: '7d59d694db37fc2f83d1eae6f375fe5d52c969c7b5069d5c041ab535b196af69' },
      { header: 'function Zx(n,s,c,f,m){', digest: '41ceded8b5e47c852cdb8d5b95f8e3f91f3b5cb926dd76b63ec25561b65409e2' },
      { header: 'function ILr(n,s=Number.POSITIVE_INFINITY){', digest: '1ee383323def178309c1f1a5217d7d92a1a14459d56948be4d0ddcb8f65f9cc3' },
      { header: 'function ud(n,s){', digest: 'a025d26a071a69d37db47f5264fc030dae50e46640ca0d216b77295a62bbf0ad' },
      { header: 'function gc(n){', digest: '32f70c54b303068cdc05668408c2f0f2dd7b54cc2a91862a2646a93cc3df7f97' },
    ],
    names: { Ns: 'gs', Dd: 'Kd', Cx: 'IE', xC: 'Zx', cmr: 'ILr', Kf: 'ud', Dc: 'gc', bn: 'gn', wo: 'No', Xf: 'pd', jn: 'Yn', Rx: 'KE', xx: 'kE', hht: '_Ct', C8: 'QJ', MNr: 'dXr', LNr: 'uXr', bGt: 'UZt' },
    oscDeclaration: 'var ms="\\x1B]8;;"',
    tabAnchor: 'let fe=gc(oe),ge=F.x2-H',
    tabReplacement: 'let fe=gc(oe);if(fe.indexOf(String.fromCharCode(9))>=0){let q=((H%_Ct)+_Ct)%_Ct;fe=QJ(" ".repeat(q)+fe).slice(q)}let ge=F.x2-H',
  },
  // 2.1.281 darwin
  {
    shape: [
      { header: 'function Rs(n){', digest: '9a0c2f80ef7f4e227d78ce236f0bae24587e439ac90b03cdbb34db2d149d54f0' },
      { header: 'class tf{', digest: 'c68ca011843f621bef8a7e74d0323ae9ac0eb5d2a190d3047e084de577786239' },
      { header: 'function ex(n,d,f,m){', digest: 'c9b4f151ba15d44851e343bf7e9ec52a691e2f200a89b54181cd0d12d5816475' },
      { header: 'function uC(n,d,f,m,y){', digest: 'b0c5d22aa99966eaea3d4760abfb33306cb5b11bd690aa8d8ce3ec1f587aaf32' },
      { header: 'function X6r(n,d=Number.POSITIVE_INFINITY){', digest: '5047f9a32564548b7813e7475839874785647ec8017a3086b9afc2ea6a700b3d' },
      { header: 'function vd(n,d){', digest: '3a300dc65b17c443fbb2485449c4e4faf15a5f14a27659ad0afd9197b0f27cad' },
      { header: 'function Tc(n){', digest: '6e14ebbea67d98ab0d6a10563da9ecb1a1c520772e11bfc04d81f9b7954a289d' },
    ],
    names: { Ns: 'Rs', Dd: 'tf', Cx: 'ex', xC: 'uC', cmr: 'X6r', Kf: 'vd', Dc: 'Tc', bn: 'xn', wo: 'Ll', Xf: 'Md', jn: 'Vn', Rx: 'tx', xx: '$E', hht: 'wIt', C8: 'KQ', MNr: 'Koo', LNr: 'Yoo', bGt: 'Fsn' },
    oscDeclaration: 'var Ss="\\x1B]8;;"',
    tabAnchor: 'let me=Tc(re),ge=k.x2-U',
    tabReplacement: 'let me=Tc(re);if(me.indexOf(String.fromCharCode(9))>=0){let q=((U%wIt)+wIt)%wIt;me=KQ(" ".repeat(q)+me).slice(q)}let ge=k.x2-U',
  },
  // 2.1.281 linux
  {
    shape: [
      { header: 'function Cs(n){', digest: '697172aa9a012689dec1039f928cf1cd5555787ed484cd643bb7df1c422c334f' },
      { header: 'class tf{', digest: '963ec5f0e002f5e92f2be66ed1796b30d6861881c858029b783c9c7836c94702' },
      { header: 'function ix(n,d,f,m){', digest: '82313b116143d3a00a72b2c6962dd0dd58692901e1e68407b839f6425766cdf8' },
      { header: 'function fC(n,d,f,m,y){', digest: '321d46c4530acf46bfa4bdaa013e5fe9e0076b3f8a37b59ad30ff53850364d59' },
      { header: 'function V2r(n,d=Number.POSITIVE_INFINITY){', digest: 'f456f8a2d6ef62003a6fc96bacdd883f883ecea431e1d009225354f75cc88cd7' },
      { header: 'function vd(n,d){', digest: '62e53b0823f83835e1b9cfc224431d49961bd469c6a480fa61823b95b7eeb1f3' },
      { header: 'function Tc(n){', digest: 'f68dedcc478ff81e06e5f1c6a65c6f574d770386d989053682137a8b58591ff9' },
    ],
    names: { Ns: 'Cs', Dd: 'tf', Cx: 'ix', xC: 'fC', cmr: 'V2r', Kf: 'vd', Dc: 'Tc', bn: 'xn', wo: 'Pl', Xf: 'Md', jn: 'Vn', Rx: 'ox', xx: 'nx', hht: 'aPt', C8: 'FQ', MNr: 'foo', LNr: 'moo', bGt: 'Ssn' },
    oscDeclaration: 'var Ss="\\x1B]8;;"',
    tabAnchor: 'let me=Tc(re),ge=k.x2-U',
    tabReplacement: 'let me=Tc(re);if(me.indexOf(String.fromCharCode(9))>=0){let q=((U%aPt)+aPt)%aPt;me=FQ(" ".repeat(q)+me).slice(q)}let ge=k.x2-U',
  },
  // 2.1.281 win32
  {
    shape: [
      { header: 'function Ms(n){', digest: '72f21af750a40d4dcda7fd8b1673694e3f489d934153b35c11f70ae97e0f7b0c' },
      { header: 'class tf{', digest: '6e58e78427d424277d8ffb34cbe55bf0e46925cd773a890745b6d88e2a1a63df' },
      { header: 'function nx(n,d,f,m){', digest: '897adb575822f3887bee660507b9a7eb6609d3520d7b48ce0adef47c06ca90b4' },
      { header: 'function fC(n,d,f,m,y){', digest: '16363df1b5e8f33477b55a969b60aac260188f588682e471a69ef6bfbb6b95ad' },
      { header: 'function Jzr(n,d=Number.POSITIVE_INFINITY){', digest: 'fdeefec3214acc2e60164bb21cdead6e40daa9e251bf0901eaf29ad0061db6e7' },
      { header: 'function vd(n,d){', digest: 'f1732946d8f5a8838578ed6ba55acccc632dc105446fda0d92f80bfea6a0596f' },
      { header: 'function Tc(n){', digest: '407be17e8cb9bc2f7066a130e1debbc8824eee8b27287d5fab48ef1670563c31' },
    ],
    names: { Ns: 'Ms', Dd: 'tf', Cx: 'nx', xC: 'fC', cmr: 'Jzr', Kf: 'vd', Dc: 'Tc', bn: 'xn', wo: 'Pl', Xf: 'Md', jn: 'Vn', Rx: 'ix', xx: 'tx', hht: 'sIt', C8: 'W7', MNr: 'hoo', LNr: 'yoo', bGt: 'Tsn' },
    oscDeclaration: 'var Ss="\\x1B]8;;"',
    tabAnchor: 'let me=Tc(re),ge=I.x2-U',
    tabReplacement: 'let me=Tc(re);if(me.indexOf(String.fromCharCode(9))>=0){let q=((U%sIt)+sIt)%sIt;me=W7(" ".repeat(q)+me).slice(q)}let ge=I.x2-U',
  },
  // 2.1.285 darwin：ANSI 辅助函数已拆到冻结的依赖分块。
  {
    shape: [
      { header: 'function ys(n){', digest: 'cde64cf325e8da5fe5e25b08a745d5e2ebf7afa9a3a13249dc975569d9615629' },
      { header: 'class Kd{', digest: 'a219f5e963fd90cf05bbf0f05a11baab6fab6345e3b3284560b45756a7f9f273' },
      { header: 'function N1(n,d,f,m){', digest: 'f11514b07f290a7834dd4d77f3305814c17813418c23df8cf2217b8ec6e9f192' },
      { header: 'function Lx(n,d,f,m,y){', digest: '4b8fa5266696dab2714759543f4d6e88594a9673e676123ca11aead7f99f9800' },
      { header: 'function bc(n){', digest: '06f34db54c4db085e25a8abac7041bfd9d10de3346a01e90134d615eae6923f0' },
    ],
    names: { Ns: 'ys', Dd: 'Kd', Cx: 'N1', xC: 'Lx', cmr: 'clawgodAnsiTokens', Kf: 'clawgodMergeStyles', Dc: 'bc', bn: 'En', wo: 'Hl', Xf: 'dd', jn: 'Vn', Rx: 'A1', xx: 'T1', hht: 'XFt', C8: 'Cne', MNr: 'Ovo', LNr: 'Dvo', bGt: 'qgn' },
    dependency: { specifier: '/$bunfs/root/chunk-rq9vt4dd.js', digest: '6f57031332df9bc09e5fa53e405715071ea34bfffae53a07e236d808ea0babbc', tokenizer: 'OEo', normalizeStyles: 'Drn' },
    tabAnchor: 'let Ee=bc(ae),pe=G.x2-U',
    tabReplacement: 'let Ee=bc(ae);if(Ee.indexOf(String.fromCharCode(9))>=0){let q=((U%XFt)+XFt)%XFt;Ee=Cne(" ".repeat(q)+Ee).slice(q)}let pe=G.x2-U',
  },
  // 2.1.285 linux
  {
    shape: [
      { header: 'function ys(n){', digest: '2f07348ed297e7c4af1b937c6d29f5a998eefe51af0af649ebaa0bb708768294' },
      { header: 'class Id{', digest: '86b8542dd47127b6eecfcdf4a75aa7bddbf87b76d9d7285f32b25916e4f4cb1b' },
      { header: 'function _1(n,d,f,m){', digest: '256cb0c2d178419fff7701080581159fb31008a2f518f67b5ee3312f4fb7d325' },
      { header: 'function Px(n,d,f,m,y){', digest: '013cf547bb3ab4351184c79b1ac7a154a9f1c4385cf1235e6d1b5c8e2fb31d92' },
      { header: 'function bc(n){', digest: '0919440b08ebc48d0416f8efe20b0c71e9f6119ecc13f084a0c45cc2898b16de' },
    ],
    names: { Ns: 'ys', Dd: 'Id', Cx: '_1', xC: 'Px', cmr: 'clawgodAnsiTokens', Kf: 'clawgodMergeStyles', Dc: 'bc', bn: 'En', wo: 'Hl', Xf: 'dd', jn: 'Vn', Rx: 'D1', xx: 'A1', hht: 'L$t', C8: 'hne', MNr: 'Xvo', LNr: 'Jvo', bGt: 'xgn' },
    dependency: { specifier: '/$bunfs/root/chunk-63gmfw50.js', digest: '9bb893dfcdb68982c86db1392f92daa7db6f0c8fc15d65c2e9c5b67b6c265ee8', tokenizer: 'Jwo', normalizeStyles: 'hrn' },
    tabAnchor: 'let Ee=bc(ae),pe=k.x2-F',
    tabReplacement: 'let Ee=bc(ae);if(Ee.indexOf(String.fromCharCode(9))>=0){let q=((F%L$t)+L$t)%L$t;Ee=hne(" ".repeat(q)+Ee).slice(q)}let pe=k.x2-F',
  },
  // 2.1.285 win32
  {
    shape: [
      { header: 'function ys(n){', digest: '47b2cb945d61439d46e90be9286209ae9ce20de5c57c3563fd2305f34c0413a5' },
      { header: 'class Kd{', digest: '4da4a86fbaf106eee3ca5a9063a469a783cea879cc0a1e678a430ef609a78c08' },
      { header: 'function D1(n,d,f,m){', digest: 'dd5e791308b46be577475d28ccdc2bd1b9c2c7ccfcc7db33ad616c1c47a80386' },
      { header: 'function zx(n,d,f,m,y){', digest: '00f7347d22ebd1b5bb33fb313127c234cca04ea49569275c927711c41a371945' },
      { header: 'function bc(n){', digest: 'b7cd54dd30f7a4cf5a2fa67652f6dd81954d4112318fd54b25e537b653bb4180' },
    ],
    names: { Ns: 'ys', Dd: 'Kd', Cx: 'D1', xC: 'zx', cmr: 'clawgodAnsiTokens', Kf: 'clawgodMergeStyles', Dc: 'bc', bn: 'En', wo: 'Ol', Xf: 'dd', jn: 'Vn', Rx: 'w1', xx: '_1', hht: 'FFt', C8: 'Sne', MNr: 'tEo', LNr: 'nEo', bGt: 'Lgn' },
    dependency: { specifier: 'B:/~BUN/root/chunk-e9tkhk3c.js', digest: '7afc65e2947df22dc031264fe732ec31c0f805896d350dc63ca9ef1432d54981', tokenizer: 'rvo', normalizeStyles: 'Srn' },
    tabAnchor: 'let Ee=bc(ae),pe=I.x2-U',
    tabReplacement: 'let Ee=bc(ae);if(Ee.indexOf(String.fromCharCode(9))>=0){let q=((U%FFt)+FFt)%FFt;Ee=Sne(" ".repeat(q)+Ee).slice(q)}let pe=I.x2-U',
  },
  // 2.1.291 linux
  {
    shape: [
      { header: 'function Es(n){', digest: 'a32a7137022622acc46eb9378bb835df31699cd8c74300e90c4e6b3de6ea694b' },
      { header: 'class tf{', digest: '727d5c0a49ca31a7947dd049045268150523465aa2ffbf186981d2538f4972e7' },
      { header: 'function Gx(n,u,f,m){', digest: 'a9b91dc61ba7ae6fe04ed1cae75681a0cacba6947074d17c6f7326c711c4a00f' },
      { header: 'function Z1(n,u,f,m,y){', digest: '99781d2c0f3a53b3d82ac3d6033a9ab330ee98f93d55650ea90f3d79d330d092' },
      { header: 'function Ka(n){', digest: 'e4560bf3a51adfb3391e4368fac331beb89f2a7fb54f969df9853165aab9cab2' },
    ],
    names: { Ns: 'Es', Dd: 'tf', Cx: 'Gx', xC: 'Z1', cmr: 'clawgodAnsiTokens', Kf: 'clawgodMergeStyles', Dc: 'Ka', bn: 'Cn', wo: 'Lr', Xf: 'Md', jn: 'Jn', Rx: 'Yx', xx: 'Ix', hht: 'Gkt', C8: 'Qdr', MNr: 'i3o', LNr: 's3o', bGt: 'uMn' },
    dependency: { specifier: '/$bunfs/root/chunk-ftptxc63.js', digest: '63aa66862c7747246fbfc88c322829913144d759725428da8e8491ec295de73f', tokenizer: 'IGo', normalizeStyles: 'P_n' },
    tabAnchor: 'let se=Ka(me),ue=K.x2-B',
    tabReplacement: 'let se=Ka(me);if(se.indexOf(String.fromCharCode(9))>=0){let q=((B%Gkt)+Gkt)%Gkt;se=Qdr([" ".repeat(q)+se]).join("").slice(q)}let ue=K.x2-B',
  },
  // 2.1.291 win32
  {
    shape: [
      { header: 'function Es(n){', digest: '469b58f79e65664849a5d4509bc649fb1949e1d9fd8f70f447897a62224689be' },
      { header: 'class tf{', digest: '49c80d3e5ca1400182aa3f449d95fd0808ee720081870904cc0d44b430238d66' },
      { header: 'function Fx(n,u,f,m){', digest: 'ee252a4e0b3a10c87a86483d27d4723cfdfd4ca36a498437c0331a8c4b50005f' },
      { header: 'function V1(n,u,f,m,y){', digest: '4c61c92e9a77b5435bcc9583ed5f4a9bd49fc63fa36ec2e7ff8f11ef5996e9f6' },
      { header: 'function Ya(n){', digest: '88282e0b191770af4e254185c98f6612b3e35761ded6d91d749cefef76363e06' },
    ],
    names: { Ns: 'Es', Dd: 'tf', Cx: 'Fx', xC: 'V1', cmr: 'clawgodAnsiTokens', Kf: 'clawgodMergeStyles', Dc: 'Ya', bn: 'Cn', wo: 'Lr', Xf: 'Md', jn: 'Jn', Rx: 'Ux', xx: 'zx', hht: 'Ykt', C8: 'iur', MNr: 'tYo', LNr: 'eYo', bGt: 'bMn' },
    dependency: { specifier: 'B:/~BUN/root/chunk-1dws3qtz.js', digest: 'e263e43718cbb1e2f25310a355862a6e7fe7ce1bf66f181c14f96b03c538556f', tokenizer: 'F2o', normalizeStyles: 'H_n' },
    tabAnchor: 'let se=Ya(me),ue=K.x2-B',
    tabReplacement: 'let se=Ya(me);if(se.indexOf(String.fromCharCode(9))>=0){let q=((B%Ykt)+Ykt)%Ykt;se=iur([" ".repeat(q)+se]).join("").slice(q)}let ue=K.x2-B',
  },
  // 2.1.292 linux
  {
    shape: [
      { header: 'function Es(n){', digest: 'fe4ca7f27a3ebd1d01381e3c995ceca1cf6a3ac5dc2d003cd0594c86464dfa41' },
      { header: 'class nf{', digest: '81d9d65fbbf54f5107689b62dc09267401b4f7533db7d8f388cdc9952f30461e' },
      { header: 'function Ux(n,u,f,m){', digest: '04e4977e3cd31208566109716851bcd5c89a6284e8fa88cf7bccf4f97da3a4ec' },
      { header: 'function V1(n,u,f,m,y){', digest: 'fae50fac8d73a94331fedd083f76119a2165e797ab83dbe17d3871a4e4ec0491' },
      { header: 'function ja(n){', digest: 'f9718bb0776413ab6fa13cbd5a82d111ef20178964a66e9fdf0fbcbaf1cc6ab2' },
    ],
    names: { Ns: 'Es', Dd: 'nf', Cx: 'Ux', xC: 'V1', cmr: 'clawgodAnsiTokens', Kf: 'clawgodMergeStyles', Dc: 'ja', bn: 'Cn', wo: 'Lr', Xf: 'Td', jn: 'Jn', Rx: 'kx', xx: 'Fx', hht: 'GAe', C8: '$_r', MNr: 'Z9o', LNr: 'Q9o', bGt: 'H0n' },
    dependency: { specifier: '/$bunfs/root/chunk-y4a70sha.js', digest: '29670ade86173894e52907b34a5925877c37c2146331b61d7b12d44736d05d71', tokenizer: 's3o', normalizeStyles: 'Twn' },
    tabAnchor: 'let se=ja(me),ue=G.x2-B',
    tabReplacement: 'let se=ja(me);if(se.indexOf(String.fromCharCode(9))>=0){let q=((B%GAe)+GAe)%GAe;se=$_r([" ".repeat(q)+se]).join("").slice(q)}let ue=G.x2-B',
  },
  // 2.1.292 win32
  {
    shape: [
      { header: 'function Es(n){', digest: '6f7d80edd90a31f2cf3c0dc01974190ee964253e1263aca2e5c5bdb8cc566dee' },
      { header: 'class nf{', digest: 'ac8d649c33a345a12da667ed30cd802e0c85fa0d2fb021408373b01a61c57128' },
      { header: 'function Ux(n,u,f,m){', digest: '93dc6f7ab7c23024a7847f7247d1ba81a40d8280dca83c606575d6794f1a2149' },
      { header: 'function V1(n,u,f,m,y){', digest: 'fae50fac8d73a94331fedd083f76119a2165e797ab83dbe17d3871a4e4ec0491' },
      { header: 'function Ya(n){', digest: '7888f8eeadceda95a2bbf6133b6b2b182644ebfd1399795a49ca0229e0e3ee0e' },
    ],
    names: { Ns: 'Es', Dd: 'nf', Cx: 'Ux', xC: 'V1', cmr: 'clawgodAnsiTokens', Kf: 'clawgodMergeStyles', Dc: 'Ya', bn: 'Cn', wo: 'Lr', Xf: 'Td', jn: 'Jn', Rx: 'kx', xx: 'Fx', hht: 'GCe', C8: 'Y_r', MNr: 'KXo', LNr: 'qXo', bGt: 'WLn' },
    dependency: { specifier: 'B:/~BUN/root/chunk-eya2x6wc.js', digest: '77715bd017f885a84758ea411e639c28268ac82225e0e8ab1935141c811ffb4a', tokenizer: 'p3o', normalizeStyles: 'Mwn' },
    tabAnchor: 'let se=Ya(me),ue=G.x2-z',
    tabReplacement: 'let se=Ya(me);if(se.indexOf(String.fromCharCode(9))>=0){let q=((z%GCe)+GCe)%GCe;se=Y_r([" ".repeat(q)+se]).join("").slice(q)}let ue=G.x2-z',
  },
  // 2.1.292 darwin
  {
    shape: [
      { header: 'function Es(n){', digest: 'e75b78d3c1e0b0bcd57b4af4e7e9c5e17fd6ee6b9f9258d37ba278bcdeb46681' },
      { header: 'class nf{', digest: '681d119f33fe5caf2ae4104987610e9f270d2ae157204ddf76ff62c67e965503' },
      { header: 'function Ix(n,u,f,m){', digest: 'd5bf73d68abd1c541fd882741caabaadaa49b21764a66868dd1c436b2df639c4' },
      { header: 'function Q1(n,u,f,m,y){', digest: 'd73889c55bcc3fc73fcf6bc09735b8534faf335abfc1bee9688d4f7cf6e52b42' },
      { header: 'function Ya(n){', digest: '06cc2a8c1597f053dfead458403cdf3e8824f1fb7cf978eaae807e90610dbfeb' },
    ],
    names: { Ns: 'Es', Dd: 'nf', Cx: 'Ix', xC: 'Q1', cmr: 'clawgodAnsiTokens', Kf: 'clawgodMergeStyles', Dc: 'Ya', bn: 'Cn', wo: 'Lr', Xf: 'Td', jn: 'Jn', Rx: 'Gx', xx: 'kx', hht: 'QAe', C8: 'aSr', MNr: 'NXo', LNr: 'FXo', bGt: 'QDn' },
    dependency: { specifier: '/$bunfs/root/chunk-wsc1qqhv.js', digest: 'df830446dc1a91768a02957b0e5c7c01d46974963793634eac48db7c1c33bdfb', tokenizer: 'W3o', normalizeStyles: 'Gwn' },
    tabAnchor: 'let se=Ya(me),ue=G.x2-B',
    tabReplacement: 'let se=Ya(me);if(se.indexOf(String.fromCharCode(9))>=0){let q=((B%QAe)+QAe)%QAe;se=aSr([" ".repeat(q)+se]).join("").slice(q)}let ue=G.x2-B',
  },
  // 2.1.296 darwin：冻结重新压缩的渲染器及共享依赖。
  {
    shape: [
      { header: 'function bs(n){', digest: '1f187dc1b64631bd1838467eb614982640935e6c195c6565fd050484fb99ecaa' },
      { header: 'class nf{', digest: '67f234a35590b0a7e908f6b92b2fc90a9555d532be544577d97170fb10d58c77' },
      { header: 'function K1(n,u,f,m){', digest: 'f30fee08ded893191fc1503727be0dd6c18fd6878c431521285839134320887e' },
      { header: 'function $x(n,u,f,m,y){', digest: '6dc2b7cf3688afc30b82ba0a60c5d518fb500b3bfd5567ede97c2ffcf99c1c82' },
      { header: 'function wc(n){', digest: '2677a9ec2b6293b01e1da79d47df3ef39e1d7db5ce0b07ea65239c8a47ffce62' },
    ],
    names: { Ns: 'bs', Dd: 'nf', Cx: 'K1', xC: '$x', cmr: 'clawgodAnsiTokens', Kf: 'clawgodMergeStyles', Dc: 'wc', bn: 'Cn', wo: 'Fr', Xf: 'Md', jn: '$n', hht: 'nPe', Rx: 'Y1', xx: 'G1', bGt: 'Idt', LNr: 'Gas', MNr: 'Was', C8: 'mCo' },
    dependency: { specifier: '/$bunfs/root/chunk-q4ya5hp8.js', digest: 'af9981afeb41bc2063fc88fbd1386bf960f9f731336e5b9f43a1525571ca31f3', tokenizer: '_ns', normalizeStyles: 'nxn' },
    shared: { specifier: '/$bunfs/root/chunk-t58kj6z7.js', digest: 'bdf6e3dc738a7e907f629626301f1db57163ff23280792dd42efa125f4633283', factory: '_On', renderer: 'chunk-06azbynj.js', text: 'chunk-xrjhyksm.js', textDigest: '8c426459e3b62c20041beb8c0cd44943aac373bad15744d92b060e79d68a9d12', textBranch: 'if(!B.test(n))return b(R(n));' },
    tabAnchor: 'let ue=wc(he),se=K.x2-z',
    tabReplacement: 'let ue=wc(he);if(ue.indexOf(String.fromCharCode(9))>=0){let q=((z%nPe)+nPe)%nPe;ue=mCo([" ".repeat(q)+ue]).join("").slice(q)}let se=K.x2-z',
  },
  // 2.1.296 linux：冻结重新压缩的渲染器及共享依赖。
  {
    shape: [
      { header: 'function Ss(n){', digest: 'bfcb92dcaa2d61f4da7af9413ba3d6b6d7b2108e39a6b429d41c663a8ce7115d' },
      { header: 'class nf{', digest: '2c0fef22332528b7dfb88f555c03bdb9f51c7baf6a17d12c037974352ee2b979' },
      { header: 'function Y1(n,u,f,m){', digest: '5f58eae16d18c14b28983aab9791b8b062146a061b227628798870c2fc115be1' },
      { header: 'function eC(n,u,f,m,y){', digest: 'd3f0c5662c6ab186850cf40f062819f8547ad8586e01ddcd43302bae06923c4e' },
      { header: 'function wc(n){', digest: 'e36743568f2abcdaf43c00af342d0cfc5cafc39ae506970c0e0110b651e0e690' },
    ],
    names: { Ns: 'Ss', Dd: 'nf', Cx: 'Y1', xC: 'eC', cmr: 'clawgodAnsiTokens', Kf: 'clawgodMergeStyles', Dc: 'wc', bn: 'Cn', wo: 'Fr', Xf: 'Td', jn: '$n', hht: 'Yxe', Rx: 'W1', xx: 'K1', bGt: 'vdt', LNr: 'sas', MNr: 'oas', C8: 'NTo' },
    dependency: { specifier: '/$bunfs/root/chunk-9kgj8k7e.js', digest: '4b4cc57ca14bfb27e2bb65a85ae569b1e82b361f309e7ab7b94e26880dcfa2b0', tokenizer: 'Mts', normalizeStyles: 'NRn' },
    shared: { specifier: '/$bunfs/root/chunk-0ev62b0n.js', digest: '7c4b71fc584f611b3d206472ad4ccb2e84d906117a4f5894aa831431889be3c7', factory: 'eOn', renderer: 'chunk-4nfvaqps.js', text: 'chunk-rhjwzamj.js', textDigest: 'caa304102cb7d98d13aab0405441dde42657b0e58de0324be0b25a58a71f2543', textBranch: 'if(!B.test(n))return b(M(n));' },
    tabAnchor: 'let ue=wc(he),se=G.x2-z',
    tabReplacement: 'let ue=wc(he);if(ue.indexOf(String.fromCharCode(9))>=0){let q=((z%Yxe)+Yxe)%Yxe;ue=NTo([" ".repeat(q)+ue]).join("").slice(q)}let se=G.x2-z',
  },
  // 2.1.296 win32：冻结重新压缩的渲染器及共享依赖。
  {
    shape: [
      { header: 'function Ss(n){', digest: 'b695e22c1ab55937db1465802e08d2b61a469e7ed2204fb902ed809955f431b8' },
      { header: 'class nf{', digest: '427289aa7589f17fee46aa1daf633e5f96eeff6d59fb12932c51c97e0e27de5b' },
      { header: 'function j1(n,u,f,m){', digest: '2d2adb0d399bce3c27b9a4ccd27d8abedc6d0a852a3fba0b59c11c47fce4d6e3' },
      { header: 'function tC(n,u,f,m,y){', digest: '4227dbfe2d9d7752e9f96e774459dc3d4be9ba664da2afeeb051af3fe2720ce2' },
      { header: 'function wc(n){', digest: '4dac1e8bd47ccf5f071e098c69678af527d4c1ad88e3d7c846dd471c029d71cb' },
    ],
    names: { Ns: 'Ss', Dd: 'nf', Cx: 'j1', xC: 'tC', cmr: 'clawgodAnsiTokens', Kf: 'clawgodMergeStyles', Dc: 'wc', bn: 'Cn', wo: 'Fr', Xf: 'Md', jn: '$n', hht: 'Yxe', Rx: 'q1', xx: 'W1', bGt: 'Odt', LNr: 'pas', MNr: 'uas', C8: 'GTo' },
    dependency: { specifier: 'B:/~BUN/root/chunk-7s4gkxzj.js', digest: '65b19928986d338ac1d72ede3bccda2121858a71ec650f14d8bc2b0da1992c2e', tokenizer: 'Bts', normalizeStyles: 'KAn' },
    shared: { specifier: 'B:/~BUN/root/chunk-vzfwnjmg.js', digest: '185144f33623c473a444229b519b538dc401be9b1cea46f3000a1657c98a9bee', factory: 'pOn', renderer: 'chunk-v44rfc3q.js', text: 'chunk-vehsqt79.js', textDigest: '6e77c8050152b0e06995c2cc03c429bd3011e172b9ca0a83463b3d97bdef9a6b', textBranch: 'if(!B.test(n))return b(R(n));' },
    tabAnchor: 'let ue=wc(he),se=G.x2-U',
    tabReplacement: 'let ue=wc(he);if(ue.indexOf(String.fromCharCode(9))>=0){let q=((U%Yxe)+Yxe)%Yxe;ue=GTo([" ".repeat(q)+ue]).join("").slice(q)}let se=G.x2-U',
  },
  // 2.1.295：共享工厂和 ANSI 分块重新压缩，继续冻结渲染及名称校验。
  {
    shape: [
      { header: 'function vs(n){', digest: '532ff22019d6005e3857308e514519e2945a4df8728e8e485ed232d4346f5da2' },
      { header: 'class ef{', digest: 'bdf6488a3baeb5e9593953fad917f29e89d67485768bd1abb1221cd09ac15a21' },
      { header: 'function k1(n,u,f,m){', digest: 'f4a9cc24679c791f85134cf87854338c495c067975732d2ff8d6873dbaa3feb1' },
      { header: 'function Xx(n,u,f,m,y){', digest: 'd28ce25a4b14e53e4fb90311192de4fdcad95fcc88bd794663c5cd355eace398' },
      { header: 'function Nc(n){', digest: '315d0c5a38f5932dbf123e09bfb31ab00256534eae4ca39f9c4f811b1764b23c' },
    ],
    names: { Ns: 'vs', Dd: 'ef', Cx: 'k1', xC: 'Xx', cmr: 'clawgodAnsiTokens', Kf: 'clawgodMergeStyles', Dc: 'Nc', bn: 'Cn', wo: 'Pr', Xf: 'Md', jn: '$n', Rx: 'I1', xx: 'U1', hht: 'Axe', C8: 'AAo', MNr: 'Aas', LNr: 'Tas', bGt: '_jn' },
    dependency: { specifier: '/$bunfs/root/chunk-bjcznv89.js', digest: 'fe6454a7120901eb212f2c216fdaff4558ea8f371bd427196b3ca63ab1cc77ee', tokenizer: 'dns', normalizeStyles: 'hRn' },
    shared: { specifier: '/$bunfs/root/chunk-2v0x57v3.js', digest: '28b6d2f6ce3b8222020d2e6386244a1b6c3bed2e09a4f024ef3004e9b5310a55', factory: 'xIn', renderer: 'chunk-fg8psmve.js', text: 'chunk-nve3vbhq.js', textDigest: '29eeaf1a67f96c164d40199ff7a09cd843d18e4c15caae282bec619fef9c288d', textBranch: 'if(!B.test(n))return b(M(n));' },
    tabAnchor: 'let ue=Nc(he),se=K.x2-z',
    tabReplacement: 'let ue=Nc(he);if(ue.indexOf(String.fromCharCode(9))>=0){let q=((z%Axe)+Axe)%Axe;ue=AAo([" ".repeat(q)+ue]).join("").slice(q)}let se=K.x2-z',
  },
  {
    shape: [
      { header: 'function vs(n){', digest: 'b0edfaea0c238cf172fa0c418f835a0833de6f7c8fd089fefbc5f9b02b7be27d' },
      { header: 'class ef{', digest: '0218a1127d4c2aa7e375bea4046529015c353fcfe0e7076145663ac42fef2478' },
      { header: 'function k1(n,u,f,m){', digest: 'affd2baa17a78b1b4556231441ee182133cc1418a578702afa541f650b72f25b' },
      { header: 'function Qx(n,u,f,m,y){', digest: 'fddad497696c9991a165b374a3a4b46122d04dce0c3377f5568cecd6979ae7a0' },
      { header: 'function Nc(n){', digest: 'abd722f2874aac5cb74ef3627ebd226a1ed6e1f353d7020e1b822aaa24cb7a7a' },
    ],
    names: { Ns: 'vs', Dd: 'ef', Cx: 'k1', xC: 'Qx', cmr: 'clawgodAnsiTokens', Kf: 'clawgodMergeStyles', Dc: 'Nc', bn: 'Rn', wo: 'Pr', Xf: 'Rd', jn: '$n', Rx: 'G1', xx: 'U1', hht: 'bxe', C8: 'YTo', MNr: 'Bis', LNr: 'jis', bGt: 'ejn' },
    dependency: { specifier: '/$bunfs/root/chunk-ch6xv8ya.js', digest: '109dbce5fcc6f1a73a9d496c2f6dc3f46bd116092126824d46d8abe336d47ec9', tokenizer: 'Tts', normalizeStyles: 'JCn' },
    shared: { specifier: '/$bunfs/root/chunk-7stz4g07.js', digest: '965478bef3b3b9d546801b3b832bb61ef66756289f5417be68cc4b97328c489c', factory: 'uIn', renderer: 'chunk-x31wb8sb.js', text: 'chunk-ha9h2ky5.js', textDigest: '738e6c85c861e781dff13a6aff30ca78d6c17d761d18b5c952ae1250eb596e24', textBranch: 'if(!B.test(n))return x(M(n));' },
    tabAnchor: 'let ue=Nc(he),se=K.x2-U',
    tabReplacement: 'let ue=Nc(he);if(ue.indexOf(String.fromCharCode(9))>=0){let q=((U%bxe)+bxe)%bxe;ue=YTo([" ".repeat(q)+ue]).join("").slice(q)}let se=K.x2-U',
  },
  {
    shape: [
      { header: 'function vs(n){', digest: '7d5402e152b2ec82851a45ccf3492fa79dccb0ac00261d5d285ec5a4de78192c' },
      { header: 'class ef{', digest: 'c89d809cdec1e9e2595f825951d16cb4b9c4232a46edf5f32bc6062352c76b5e' },
      { header: 'function K1(n,u,f,m){', digest: '17dee4ca5f3c38c189129a97dcef2838cdda8dfd98377b09fd7065f68551a410' },
      { header: 'function Zx(n,u,f,m,y){', digest: '2d66a862dfaa473fe800dc127fe200119914b4a28cc5b0f99fdfe81626ac22ad' },
      { header: 'function Nc(n){', digest: 'd20b9222ee25d17314607cc7babc8b5772e5c08882b40dbabda7ba185d0b8111' },
    ],
    names: { Ns: 'vs', Dd: 'ef', Cx: 'K1', xC: 'Zx', cmr: 'clawgodAnsiTokens', Kf: 'clawgodMergeStyles', Dc: 'Nc', bn: 'Cn', wo: 'Pr', Xf: 'Rd', jn: '$n', Rx: 'Y1', xx: 'G1', hht: 'bxe', C8: 'rCo', MNr: 'Kis', LNr: 'Yis', bGt: 'wjn' },
    dependency: { specifier: 'B:/~BUN/root/chunk-zwq6ady6.js', digest: '32bb4b7b5a5f154fbf834c73c6859f1f0355934409ba8b2e54a90dec1a4fa401', tokenizer: 'Mts', normalizeStyles: 'lAn' },
    shared: { specifier: 'B:/~BUN/root/chunk-v3xrx1m7.js', digest: '2808d1f22b13620fd4aa558595181555e80491da88ce6e19466142391210e239', factory: 'kIn', renderer: 'chunk-x7q5npp7.js', text: 'chunk-m6rh6mh9.js', textDigest: 'a6ac77a5eb46310d55b99d90e09771f6ac2e298ccebb2190a387ff279d60e798', textBranch: 'if(!B.test(n))return k(R(n));' },
    tabAnchor: 'let ue=Nc(he),se=K.x2-k',
    tabReplacement: 'let ue=Nc(he);if(ue.indexOf(String.fromCharCode(9))>=0){let q=((k%bxe)+bxe)%bxe;ue=rCo([" ".repeat(q)+ue]).join("").slice(q)}let se=K.x2-k',
  },
  // 2.1.293：私有工厂拆成共享分块，渲染和技能名称校验分别冻结。
  {
    shape: [
      { header: 'function Es(n){', digest: '41de312730741d27988f7e5719459a32b95bb063a1c1c1d989bfe4d59dcd3d17' },
      { header: 'class tf{', digest: 'e286c9d0872021b22f6dd5a20afc9b9da998c69fa896da1892ccc10ee693fda1' },
      { header: 'function Ix(n,u,f,m){', digest: '470613d5099aa5afd9532960b174543e2f956089fd435dea9192d858556512f7' },
      { header: 'function X1(n,u,f,m,y){', digest: '33a0924b43d9ff7cc2f9608e070a90efbf8d80a151089895d5dcf0a7fe444fc9' },
      { header: 'function Ya(n){', digest: '86889c0ce5efce9cd73e96554e0691db0e4ecef8a67f80d2115ef95f0733381a' },
    ],
    names: { Ns: 'Es', Dd: 'tf', Cx: 'Ix', xC: 'X1', cmr: 'clawgodAnsiTokens', Kf: 'clawgodMergeStyles', Dc: 'Ya', bn: 'Cn', wo: 'Lr', Xf: 'Td', jn: 'Jn', Rx: 'Gx', xx: 'kx', hht: 'OTe', C8: 'Hwr', MNr: 'iZo', LNr: 'aZo', bGt: 'YNn' },
    dependency: { specifier: '/$bunfs/root/chunk-zy1atq7h.js', digest: '4c92442e56932318cf556da27822f5237302e3f7e923bfbc24b55de1347f0e13', tokenizer: 'c8o', normalizeStyles: '_vn' },
    shared: { specifier: '/$bunfs/root/chunk-y1vajssn.js', digest: '5827d42c03d63ef37aa3ef11d63602fbf0235ff15a78ebaa2348156955a66578', factory: 'WAn', renderer: 'chunk-5a58rh2c.js', text: 'chunk-f7dwnabf.js', textDigest: '8f5df74b5b0d2b91f77b9794a6cc68234384f7be5577c4ad9d796a5547cf0cf5', textBranch: 'if(!F.test(n))return b(M(n));' },
    tabAnchor: 'let se=Ya(me),ue=K.x2-B',
    tabReplacement: 'let se=Ya(me);if(se.indexOf(String.fromCharCode(9))>=0){let q=((B%OTe)+OTe)%OTe;se=Hwr([" ".repeat(q)+se]).join("").slice(q)}let ue=K.x2-B',
  },
  {
    shape: [
      { header: 'function Es(n){', digest: '32b6bdc25d9ef2457819ede122a5d60401e21706c218c94eb2ab799e107bc364' },
      { header: 'class tf{', digest: '70955c89453b7fed4e809d482ba43028fe2864d62ccbbfdfafa6459c84b4498a' },
      { header: 'function zx(n,u,f,m){', digest: '8ac68fa1c2a90a6b043726e9d0b02f8a5c5a273d02d550cc82543cf6b4f2a42c' },
      { header: 'function W1(n,u,f,m,y){', digest: 'fd4c0c75a6d3744210ead3e03c6579f1c1ee7337e8598a82a6c35aa9c0f0f200' },
      { header: 'function Ya(n){', digest: '31cd1e73058f9146e7ac88163fddaa6b91c5eb3d64adaf034c81a398f6ed0563' },
    ],
    names: { Ns: 'Es', Dd: 'tf', Cx: 'zx', xC: 'W1', cmr: 'clawgodAnsiTokens', Kf: 'clawgodMergeStyles', Dc: 'Ya', bn: 'Cn', wo: 'Lr', Xf: 'Td', jn: 'Jn', Rx: 'Fx', xx: 'Bx', hht: 'TCe', C8: 'dwr', MNr: 'w7o', LNr: 'v7o', bGt: 'INn' },
    dependency: { specifier: '/$bunfs/root/chunk-jf5janxj.js', digest: '81c5382396e6636438956e9ffe5e19ec63fcc0c0a1ccb6c15177d6240c5d8e3f', tokenizer: 'T5o', normalizeStyles: 'Zvn' },
    shared: { specifier: '/$bunfs/root/chunk-pxa7nhh6.js', digest: '3a6b334ec4b4da0a9e98e0ed704a8ee34c8f34af6608eb71c4b59a8db091fa1d', factory: 'TAn', renderer: 'chunk-c47fp7vb.js', text: 'chunk-5tfk4bjh.js', textDigest: '8860223dde0477ed095b13bf15957d22413241e92672e7711fbee669bd4e9843', textBranch: 'if(!F.test(n))return k(M(n));' },
    tabAnchor: 'let se=Ya(me),ue=K.x2-B',
    tabReplacement: 'let se=Ya(me);if(se.indexOf(String.fromCharCode(9))>=0){let q=((B%TCe)+TCe)%TCe;se=dwr([" ".repeat(q)+se]).join("").slice(q)}let ue=K.x2-B',
  },
  {
    shape: [
      { header: 'function Es(n){', digest: '7c9f88f31a22d56d095584087a3baccc99aed457bc6830c25709f004a050b597' },
      { header: 'class tf{', digest: '2be013d46b8110134803ea26d40210e5551d320d75ebf59ac771fa7560515839' },
      { header: 'function zx(n,u,f,m){', digest: 'dc0605f6d38771de60d9ba11769271c10cc9446b53e9add42b7d94506ac18194' },
      { header: 'function W1(n,u,f,m,y){', digest: 'fd4c0c75a6d3744210ead3e03c6579f1c1ee7337e8598a82a6c35aa9c0f0f200' },
      { header: 'function ja(n){', digest: '41936c76938dcb1d24839b0e0b41955c1f73ccaa75a62f6ccac2d7362b642789' },
    ],
    names: { Ns: 'Es', Dd: 'tf', Cx: 'zx', xC: 'W1', cmr: 'clawgodAnsiTokens', Kf: 'clawgodMergeStyles', Dc: 'ja', bn: 'Cn', wo: 'Lr', Xf: 'Td', jn: 'Jn', Rx: 'Fx', xx: 'Bx', hht: 'TRe', C8: 'vwr', MNr: 'yZo', LNr: '_Zo', bGt: 'UFn' },
    dependency: { specifier: 'B:/~BUN/root/chunk-9zg6kjjc.js', digest: '48c10018bef18377f19847e55712cfcb4148a84109718de5bcef9e3621d33726', tokenizer: 'M5o', normalizeStyles: 'lkn' },
    shared: { specifier: 'B:/~BUN/root/chunk-pvgfk8na.js', digest: 'dadd6baa3126841ad76f6f81fed7ec7395b0570cff8fa58bf7756cb5086a3d72', factory: 'NCn', renderer: 'chunk-7725e2h3.js', text: 'chunk-q1s4dte4.js', textDigest: 'd385cdddaa0e83bab6ea07351cf1ca61e6f5e47f6425e7b648d51b12a9d1a494', textBranch: 'if(!F.test(n))return b(R(n));' },
    tabAnchor: 'let se=ja(me),ue=K.x2-z',
    tabReplacement: 'let se=ja(me);if(se.indexOf(String.fromCharCode(9))>=0){let q=((z%TRe)+TRe)%TRe;se=vwr([" ".repeat(q)+se]).join("").slice(q)}let ue=K.x2-z',
  },
  // 2.1.291 darwin：制表符展开改用上游数组接口。
  {
    shape: [
      { header: 'function Es(n){', digest: '476aa6ef7fe9eaa699e0bd3e85f4d4c14ce7c1bbe41d10d47b3088d15b882aaa' },
      { header: 'class tf{', digest: 'cbe12c7e89d7d31465b51e8ff428edf2fc9a3a41aa5f359b7952b255e893a161' },
      { header: 'function Ix(n,u,f,m){', digest: '357638962a695be54a90d989dcfca49184e809631b38639ebe4d112783465403' },
      { header: 'function Z1(n,u,f,m,y){', digest: '99781d2c0f3a53b3d82ac3d6033a9ab330ee98f93d55650ea90f3d79d330d092' },
      { header: 'function Ka(n){', digest: 'd16c8cfcef18134c0d1a7a253d97388508941dfe947ee26069d3cabf0f05e0e9' },
    ],
    names: { Ns: 'Es', Dd: 'tf', Cx: 'Ix', xC: 'Z1', cmr: 'clawgodAnsiTokens', Kf: 'clawgodMergeStyles', Dc: 'Ka', bn: 'Cn', wo: 'Lr', Xf: 'Md', jn: 'Jn', Rx: 'Gx', xx: 'kx', hht: 'nkt', C8: 'Sur', MNr: 'G3o', LNr: 'z3o', bGt: 'x0n' },
    dependency: { specifier: '/$bunfs/root/chunk-byc0q3za.js', digest: '0ce4df7ad6e277579f445d4a8764fac5eb3d7263bde3b7c383059303d775e9ac', tokenizer: 'g6o', normalizeStyles: 'Y_n' },
    tabAnchor: 'let se=Ka(me),ue=K.x2-U',
    tabReplacement: 'let se=Ka(me);if(se.indexOf(String.fromCharCode(9))>=0){let q=((U%nkt)+nkt)%nkt;se=Sur([" ".repeat(q)+se]).join("").slice(q)}let ue=K.x2-U',
  },
  // 2.1.287 darwin
  {
    shape: [
      { header: 'function ms(n){', digest: '2e5738134455a51222b83a73e6a0eb8e28afd921b10b8bea100da2923355aef6' },
      { header: 'class Wd{', digest: '4782b232c1318c7de2bca9c008ef5c792323d4b830dd7e4a9475ddf91a206041' },
      { header: 'function A1(n,u,f,m){', digest: '27ca9965ee1ffb9e5886a1b1c7598ae68fccc6e65f8b66ff859556b2273c08ed' },
      { header: 'function zx(n,u,f,m,y){', digest: 'c6e50c879cdec717e94d7b6faec2ed91744ea55204728f5376e2bf5a6088a300' },
      { header: 'function Cc(n){', digest: '4c9f180a6f959383310b9299d40e876f62f32972d459c9ba0c3214107d53ef8b' },
    ],
    names: { Ns: 'ms', Dd: 'Wd', Cx: 'A1', xC: 'zx', cmr: 'clawgodAnsiTokens', Kf: 'clawgodMergeStyles', Dc: 'Cc', bn: 'En', wo: 'Ll', Xf: 'yd', jn: 'Vn', Rx: '_1', xx: 'N1', hht: 'D6t', C8: 'v8', MNr: 'tFo', LNr: 'nFo', bGt: 'tCn' },
    dependency: { specifier: '/$bunfs/root/chunk-e8ww06j7.js', digest: '26c20c59c750bf8bd3b5f318173d231cd83287e77994b6f07f7260785206cd24', tokenizer: 'BLo', normalizeStyles: 'ppn' },
    tabAnchor: 'let ge=Cc(le),me=K.x2-L',
    tabReplacement: 'let ge=Cc(le);if(ge.indexOf(String.fromCharCode(9))>=0){let q=((L%D6t)+D6t)%D6t;ge=v8(" ".repeat(q)+ge).slice(q)}let me=K.x2-L',
  },
  // 2.1.287 linux
  {
    shape: [
      { header: 'function ms(n){', digest: '7ae771af98437550783f7e1fbef588f2a7611ddcf77d836477ef0836bb44eff5' },
      { header: 'class Wd{', digest: 'e29e595ba621965960baadf575cdfb7533c7c07cb757ec7b7f000b7b9851ddd3' },
      { header: 'function w1(n,u,f,m){', digest: 'd551441ff7fadf2ad8dda9a8ab9f4e509c35c8746a6b534f6fbdf23082908e70' },
      { header: 'function Ux(n,u,f,m,y){', digest: 'f22eb89c891aba31a05ef51550aa663a99e2b1fdad41e235fd7e2121e09f4bf6' },
      { header: 'function Cc(n){', digest: '4dd03f284a9635eac0af4adfc7bea1787879aa8fb203bee16beaaba31a522337' },
    ],
    names: { Ns: 'ms', Dd: 'Wd', Cx: 'w1', xC: 'Ux', cmr: 'clawgodAnsiTokens', Kf: 'clawgodMergeStyles', Dc: 'Cc', bn: 'En', wo: 'Ll', Xf: 'yd', jn: 'Vn', Rx: 'D1', xx: '_1', hht: '_Gt', C8: 'h8', MNr: 'SNo', LNr: 'bNo', bGt: 'OEn' },
    dependency: { specifier: '/$bunfs/root/chunk-xm85yzmk.js', digest: 'c3a9632a58e060d50e2161534e0e124c0175141bae4ccdf73bc088796a61f0dc', tokenizer: 'sLo', normalizeStyles: 'qun' },
    tabAnchor: 'let ge=Cc(le),me=K.x2-B',
    tabReplacement: 'let ge=Cc(le);if(ge.indexOf(String.fromCharCode(9))>=0){let q=((B%_Gt)+_Gt)%_Gt;ge=h8(" ".repeat(q)+ge).slice(q)}let me=K.x2-B',
  },
  // 2.1.287 win32
  {
    shape: [
      { header: 'function ms(n){', digest: '210a40e1a396208fbaf523a1032a73116d35b15504bdd175e937ffe58ba5d061' },
      { header: 'class Wd{', digest: 'eafcfebd00770e4802e5f4de6e50357f01f1d88605bc134bf8576e9c5a507954' },
      { header: 'function w1(n,u,f,m){', digest: '611c770cc8121a5f8f5b1b89870cd21b831f9c7854642e8356825d3b4d6ba300' },
      { header: 'function Ux(n,u,f,m,y){', digest: '0dc7db9e7b7c04738eb456511434285740bceeb67a12e0cbaed9568c84c01cd5' },
      { header: 'function xc(n){', digest: 'dc4582fad33ff5b03de83fe7f7b6326fe017e2f154d5abf18c336cf289279105' },
    ],
    names: { Ns: 'ms', Dd: 'Wd', Cx: 'w1', xC: 'Ux', cmr: 'clawgodAnsiTokens', Kf: 'clawgodMergeStyles', Dc: 'xc', bn: 'En', wo: 'Ll', Xf: 'yd', jn: 'Vn', Rx: 'D1', xx: '_1', hht: 'S2t', C8: '_8', MNr: 'kHo', LNr: 'EHo', bGt: 'UEn' },
    dependency: { specifier: 'B:/~BUN/root/chunk-7wywdnvg.js', digest: 'f2053904c1d113f1aa435e61268c37aa495309d327125d1065754b0e506e400a', tokenizer: 'dNo', normalizeStyles: 'epn' },
    tabAnchor: 'let ge=xc(le),me=K.x2-B',
    tabReplacement: 'let ge=xc(le);if(ge.indexOf(String.fromCharCode(9))>=0){let q=((B%S2t)+S2t)%S2t;ge=_8(" ".repeat(q)+ge).slice(q)}let me=K.x2-B',
  },
  // 2.1.300 darwin：保留七参数绘制、方向标记和列裁剪。
  {
    "shape": [
      {
        "header": "function ms(n){",
        "digest": "f643dda5c8e11d70a4a3d144a7b2c8ff557081df4dcf731fd1ee70525ca521ce"
      },
      {
        "header": "class rf{",
        "digest": "823f4aabcce7a5e336bff161cb92493724b83be3f3c99e19e21fd1a2f05827ce"
      },
      {
        "header": "function Vx(n,u,f,m){",
        "digest": "c63320cca7f832e20897e886ec554f5eecc30e1721c2456f809dad50c791bf9c"
      },
      {
        "header": "function aC(n,u,f,m,p,g,R){",
        "digest": "274181a879b045e4be999e1efac265353251c879dbefe7b23b166aaa2d8b8ced"
      },
      {
        "header": "function ud(n){",
        "digest": "c987b3827de31c796aef658a4bd7b8773665d7a163c0d2a0e022045b6de9b71b"
      }
    ],
    "names": {
      "Ns": "ms",
      "Dd": "rf",
      "Cx": "Vx",
      "xC": "aC",
      "cmr": "clawgodAnsiTokens",
      "Kf": "clawgodMergeStyles",
      "Dc": "ud",
      "bn": "vn",
      "wo": "Mo",
      "Xf": "Td",
      "jn": "jn",
      "hht": "_ge",
      "Rx": "Xx",
      "xx": "qx",
      "bGt": "xOe",
      "LNr": "vys",
      "MNr": "Eys",
      "C8": "oNo"
    },
    "dependency": {
      "specifier": "/$bunfs/root/chunk-qva6rjg9.js",
      "digest": "fbe40834663d754296c613a1ffc07a676b5e07557c02498e6774e9e8ec62ddee",
      "tokenizer": "Ums",
      "normalizeStyles": "BDn"
    },
    "shared": {
      "specifier": "/$bunfs/root/chunk-jb09nhqp.js",
      "digest": "7b5fa6caf2ab17450a821747ce2f50995f59c02b40f5f4eb16e503d6d86c8d5f",
      "factory": "eNn",
      "renderer": "chunk-a00dbmtf.js",
      "text": "chunk-76bn3rwk.js",
      "textDigest": "f514db3f1bc1b7aaf366f08a763014395000f4896c7e2df92eb90ad1316258dd",
      "textBranch": "if(!J.test(n))return v(O(n));"
    },
    "tabAnchor": "let Ae=ud(Re),Te=q.x2-Y",
    "tabReplacement": "let Ae=ud(Re);if(Ae.indexOf(String.fromCharCode(9))>=0){let clawgodTabOffset=((Y%_ge)+_ge)%_ge;Ae=oNo([\" \".repeat(clawgodTabOffset)+Ae]).join(\"\").slice(clawgodTabOffset)}let Te=q.x2-Y",
    "writeLineSource": "function aC(n,u,f,m,p,g,R){let T=of(g)?Ab[g]+u:u;if(p.segment(T,kl()),R!==void 0)f=p.keepColumns(f,R.x1,R.x2);return p.count===0?f:paintCells(n,p.cells,f,m)}"
  },
  // 2.1.300 linux：保留七参数绘制、方向标记和列裁剪。
  {
    "shape": [
      {
        "header": "function ms(n){",
        "digest": "8701e702e7bdb4c58856974fb326e1e86f42dc0e53dcafda4577ca827a018636"
      },
      {
        "header": "class rf{",
        "digest": "09671876ba1dd77c98a47ae96f8dbd2ebd3fc4a8c6fe94a9507e005f727d9700"
      },
      {
        "header": "function Vx(n,u,f,m){",
        "digest": "c63320cca7f832e20897e886ec554f5eecc30e1721c2456f809dad50c791bf9c"
      },
      {
        "header": "function lC(n,u,f,m,p,g,R){",
        "digest": "03849ca2b628bc7e812b3321fefe76175d8a828a4f66a3a86bfb76255ca4851f"
      },
      {
        "header": "function ud(n){",
        "digest": "4c8dbf6c5098f2f0cd70f8bbf2e9784c5bbb3ad1cad3d889f9a590fa446caf6d"
      }
    ],
    "names": {
      "Ns": "ms",
      "Dd": "rf",
      "Cx": "Vx",
      "xC": "lC",
      "cmr": "clawgodAnsiTokens",
      "Kf": "clawgodMergeStyles",
      "Dc": "ud",
      "bn": "bn",
      "wo": "Mo",
      "Xf": "Td",
      "jn": "jn",
      "hht": "pge",
      "Rx": "Xx",
      "xx": "qx",
      "bGt": "vOe",
      "LNr": "Rys",
      "MNr": "Cys",
      "C8": "CLo"
    },
    "dependency": {
      "specifier": "/$bunfs/root/chunk-6r27kmjr.js",
      "digest": "a2ca374bc8520f964ea998f19c976b3b783b62500b6c274edc693a341069b02d",
      "tokenizer": "tms",
      "normalizeStyles": "v0n"
    },
    "shared": {
      "specifier": "/$bunfs/root/chunk-zytv259w.js",
      "digest": "9752cc9b4060812d272b9d834ef96febf141003b38db8d760c8f324990a6291f",
      "factory": "LLn",
      "renderer": "chunk-xqrandq6.js",
      "text": "chunk-kxsypegk.js",
      "textDigest": "e442a0b0843234d95ec3023491ba254bd56c0c46981d4d0d10405850b1824136",
      "textBranch": "if(!J.test(n))return v(O(n));"
    },
    "tabAnchor": "let we=ud(Re),Ae=q.x2-Y",
    "tabReplacement": "let we=ud(Re);if(we.indexOf(String.fromCharCode(9))>=0){let clawgodTabOffset=((Y%pge)+pge)%pge;we=CLo([\" \".repeat(clawgodTabOffset)+we]).join(\"\").slice(clawgodTabOffset)}let Ae=q.x2-Y",
    "writeLineSource": "function lC(n,u,f,m,p,g,R){let T=of(g)?Tb[g]+u:u;if(p.segment(T,kl()),R!==void 0)f=p.keepColumns(f,R.x1,R.x2);return p.count===0?f:paintCells(n,p.cells,f,m)}"
  },
  // 2.1.300 win32：保留七参数绘制、方向标记和列裁剪。
  {
    "shape": [
      {
        "header": "function ms(n){",
        "digest": "4698521e06ab4ce271dbbaf9d0b12bc3a51d8d2cf2ef21394c1ad7e022904610"
      },
      {
        "header": "class rf{",
        "digest": "65d7be5d08092fbfa5474a0425d1dd14c0f6e09827cf7fa9bc41731c6989faf3"
      },
      {
        "header": "function Xx(n,u,f,m){",
        "digest": "10f07789cbc3b963a978561d46d3fd31fb59ce359513957386bf6185fc1611a7"
      },
      {
        "header": "function sC(n,u,f,m,p,g,C){",
        "digest": "6c18c5b53b11643e2f27eba082d13460bdf1f864e6bc2572463ded04541dbc74"
      },
      {
        "header": "function ud(n){",
        "digest": "62d3bcc20eed94ecb12985185e96a74886662f88611b4bf07852792ccdd33d21"
      }
    ],
    "names": {
      "Ns": "ms",
      "Dd": "rf",
      "Cx": "Xx",
      "xC": "sC",
      "cmr": "clawgodAnsiTokens",
      "Kf": "clawgodMergeStyles",
      "Dc": "ud",
      "bn": "bn",
      "wo": "Mo",
      "Xf": "Td",
      "jn": "jn",
      "hht": "yge",
      "Rx": "Qx",
      "xx": "Vx",
      "bGt": "vIe",
      "LNr": "Dys",
      "MNr": "Mys",
      "C8": "DNo"
    },
    "dependency": {
      "specifier": "B:/~BUN/root/chunk-zejrn9cc.js",
      "digest": "283581789ef626a6bc195e7f7c70db540e273f32c60979ef489bd866d2c13125",
      "tokenizer": "lms",
      "normalizeStyles": "xLn"
    },
    "shared": {
      "specifier": "B:/~BUN/root/chunk-6gc6gzex.js",
      "digest": "cf10fe9258071471378c1d4576bcaddb01bc285580a7b0b57c51e4c7273970df",
      "factory": "WNn",
      "renderer": "chunk-zqc68dz9.js",
      "text": "chunk-68247c5r.js",
      "textDigest": "4071bdaf8d41c77ea0ace620a5b929adeabd68900de26f4f17c197765d1fdb73",
      "textBranch": "if(!J.test(n))return h(O(n));"
    },
    "tabAnchor": "let Ne=ud(Re),Ae=q.x2-Y",
    "tabReplacement": "let Ne=ud(Re);if(Ne.indexOf(String.fromCharCode(9))>=0){let clawgodTabOffset=((Y%yge)+yge)%yge;Ne=DNo([\" \".repeat(clawgodTabOffset)+Ne]).join(\"\").slice(clawgodTabOffset)}let Ae=q.x2-Y",
    "writeLineSource": "function sC(n,u,f,m,p,g,C){let T=of(g)?Tb[g]+u:u;if(p.segment(T,kl()),C!==void 0)f=p.keepColumns(f,C.x1,C.x2);return p.count===0?f:paintCells(n,p.cells,f,m)}"
  },
];

// Every name the injected source introduces must be free in the target module;
// a collision would silently change unrelated rendering.
// 2.1.299：按作用域结构冻结，分块哈希路径和压缩绑定名变化不再需要新版本条目。
const CELL_STRUCTURAL_SHAPES = [{
  shared: "a4df63c44a7007f50b1418b8f808f8600771ce2003d94c291174145ec3ba36f6", factory: 6,
  ansi: "5c710815d4d1b551b526147eacb70dcd92be27824e3e2e7ef6252df9eb1f911a", tokenizer: 115, normalizeStyles: 63,
  text: "28397f25886ab28f93bf91195312fa93730bfbb3dd9008684a59cb86bf1c28cc",
  names: {"Ns": 4385, "Dd": 5711, "Cx": 4486, "xC": 5891, "Dc": 3822, "bn": 4377, "wo": 4370, "Xf": 4371, "jn": 4381, "hht": 70, "Rx": 4538, "xx": 4415, "bGt": 80, "LNr": 54, "MNr": 53, "C8": 71},
  factoryImport: 141, ansiImport: 143,
  renderers: [
    {"digest": "b7a1060c5b4f6e26072613f018208b916b3beb5afab9f604995072543e6bdd4d", "tabs": "a229d5fa35083b57f8f0a7e0e648c322ddc6a56226ec64eecf604e182c17fcce", "tabWidth": 319, "expandTabs": 329},
    {"digest": "d26bc9e2c07527a452f7538680130a62ce40633e5040655cf0fe97ddd4c17be9", "tabs": "b7043d4f06591a366b96ab56aeb9a2cf4134376e9239159fc4ddbd46725b9e0d", "tabWidth": 319, "expandTabs": 329},
    {"digest": "788d9fe44d68c2fb882392dff86141dab077d6eb0bf143d1eb8b2ad476f32cb5", "tabs": "9d0fffe468608835b04f56b77f72e5be55225a023b93ed29256df64f3dd48b1c", "tabWidth": 317, "expandTabs": 327},
  ],
  styles: "93ef3689e968970712db14c81c4f3955a24e7d93aae6b3d21ebf24de001e31e4",
  chalk: "2fdd7ca5ded53c63977f6f7efb408920fd99b93e1fee3ce1f25a57d809c27aab",
}];

function structuralCellProfile(source, dependencies) {
  let renderer;
  try { renderer = structuralModule(source); } catch { return null; }
  const reference = CELL_STRUCTURAL_SHAPES.find(profile => profile.renderers.some(item => item.digest === renderer.digest));
  if (!reference) return null;
  const variant = reference.renderers.find(item => item.digest === renderer.digest);
  const names = Object.fromEntries(Object.entries(reference.names).map(([key, index]) => [key, renderer.bindings[index]]));
  names.cmr = 'clawgodAnsiTokens';
  names.Kf = 'clawgodMergeStyles';
  const imports = renderer.ast.body.filter(node => node.type === 'ImportDeclaration');
  function dependencyOf(local, digest) {
    const binding = imports.find(node => node.specifiers.some(item => item.local.name === local));
    if (!binding) return null;
    const text = dependencies.get(basename(binding.source.value));
    if (typeof text !== 'string') return null;
    try {
      const structure = structuralModule(text);
      if (structure.digest !== digest) return null;
      const expected = digest === reference.ansi ? [[143, 60], [144, 76]]
        : digest === reference.shared ? [[137, 0], [138, 1], [139, 2], [140, 5], [141, 6]]
        : digest === reference.styles ? [[52, 16], [53, 18], [54, 25], [55, 50], [56, 60], [57, 64], [58, 78]]
        : digest === reference.chalk ? [[79, 176], [80, 187]]
        : [[70, variant.tabWidth], [71, variant.expandTabs], [72, variant.expandTabs + 13], [73, variant.expandTabs + 15]];
      if (binding.specifiers.length !== expected.length || expected.some(([local, imported], index) =>
        binding.specifiers[index].local.name !== renderer.bindings[local]
        || binding.specifiers[index].imported?.name !== structure.bindings[imported])) return null;
      return { source: text, structure, specifier: binding.source.value };
    } catch { return null; }
  }
  for (const [key, digest, index] of [
    ['hht', variant.tabs, variant.tabWidth], ['C8', variant.tabs, variant.expandTabs],
    ['MNr', reference.styles, 18], ['LNr', reference.styles, 25], ['bGt', reference.chalk, 187],
  ]) {
    const helper = dependencyOf(names[key], digest);
    const binding = imports.flatMap(node => node.specifiers).find(item => item.local.name === names[key]);
    if (!helper || binding.imported.name !== helper.structure.bindings[index]) return null;
  }
  const shared = dependencyOf(renderer.bindings[reference.factoryImport], reference.shared);
  const ansi = dependencyOf(renderer.bindings[reference.ansiImport], reference.ansi);
  if (!shared || !ansi) return null;
  const factory = shared.structure.bindings[reference.factory];
  const sharedImport = imports.find(node => node.source.value === shared.specifier);
  if (!sharedImport.specifiers.some(item => item.local.name === factory && item.imported.name === factory)) return null;
  const textCandidates = [...dependencies].filter(([, text]) => text.includes(shared.specifier)
    && text.includes(`${factory}(`));
  let textModule;
  for (const [file, text] of textCandidates) {
    try {
      const structure = structuralModule(text);
      if (structure.digest === reference.text) {
        const imported = structure.ast.body.find(node => node.type === 'ImportDeclaration' && node.source.value === shared.specifier);
        const expected = [[19, 0], [20, 5], [21, 6]];
        if (!imported || imported.specifiers.length !== expected.length || expected.some(([local, upstream], index) =>
          imported.specifiers[index].local.name !== structure.bindings[local]
          || imported.specifiers[index].imported?.name !== shared.structure.bindings[upstream])) return null;
        if (textModule) return null;
        textModule = { file, source: text };
      }
    } catch { return null; }
  }
  if (!textModule) return null;
  const shape = [];
  for (const key of ['Ns', 'Dd', 'Cx', 'xC', 'Dc']) {
    const nodes = renderer.ast.body.filter(node => node.id?.name === names[key]);
    if (nodes.length !== 1) return null;
    const declaration = source.slice(nodes[0].start, nodes[0].end);
    shape.push({ header: declaration.slice(0, declaration.indexOf('{') + 1), digest: createHash('sha256').update(declaration).digest('hex') });
  }
  const anchors = [...source.matchAll(/let ([\w$]+)=([\w$]+)\(([\w$]+)\),([\w$]+)=([\w$]+)\.x2-([\w$]+)/g)]
    .filter(match => match[2] === names.Dc);
  const branches = [...textModule.source.matchAll(/if\(![\w$]+\.test\([\w$]+\)\)return [\w$]+\([\w$]+\([\w$]+\)\);/g)];
  if (anchors.length !== 1 || branches.length !== 1) return null;
  const [tabAnchor, out, sanitize, input, width, box, col] = anchors[0];
  return {
    shape, names,
    dependency: { specifier: ansi.specifier, digest: createHash('sha256').update(ansi.source).digest('hex'),
      tokenizer: ansi.structure.bindings[reference.tokenizer], normalizeStyles: ansi.structure.bindings[reference.normalizeStyles] },
    shared: { specifier: shared.specifier, digest: createHash('sha256').update(shared.source).digest('hex'), factory,
      text: textModule.file, textDigest: createHash('sha256').update(textModule.source).digest('hex'), textBranch: branches[0][0] },
    tabAnchor,
    tabReplacement: `let ${out}=${sanitize}(${input});if(${out}.indexOf(String.fromCharCode(9))>=0){let q=((${col}%${names.hht})+${names.hht})%${names.hht};${out}=${names.C8}([" ".repeat(q)+${out}]).join("").slice(q)}let ${width}=${box}.x2-${col}`,
  };
}

const CELL_RENDERER_NAMES = Object.freeze([
  'clawgodCacheLimit', 'clawgodOsc8Prefix', 'clawgodSgr', 'clawgodAmbiguousNarrow',
  'clawgodSegmenter', 'clawgodGraphemes', 'clawgodCsiEnd', 'clawgodOscEnd',
  'sanitizeControlSequences', 'parseStyledText', 'packCell', 'unionDamage',
  'writeCell', 'paintCells', 'clawgodAnsiTokens', 'clawgodNormalizeStyles', 'clawgodMergeStyles',
]);

// Locates the closing brace of a declaration. The result is always checked
// against a frozen digest before anything is rewritten, so a mis-scan can only
// cause a rejected candidate, never a corrupted one.
export function findDeclarationEnd(source, start) {
  let depth = 0;
  let previous = '';
  for (let index = start; index < source.length; index++) {
    const char = source[index];
    const next = source[index + 1];
    if (char === '/' && next === '/') {
      index = source.indexOf('\n', index);
      if (index < 0) return -1;
      continue;
    }
    if (char === '/' && next === '*') {
      index = source.indexOf('*/', index);
      if (index < 0) return -1;
      index += 1;
      continue;
    }
    if (char === '"' || char === "'" || char === '`') {
      index = findStringEnd(source, index, char);
      if (index < 0) return -1;
      previous = 'value';
      continue;
    }
    if (char === '/' && startsExpression(previous)) {
      index = findRegexEnd(source, index);
      if (index < 0) return -1;
      previous = 'value';
      continue;
    }
    if (/[A-Za-z0-9_$]/.test(char)) {
      while (index + 1 < source.length && /[A-Za-z0-9_$]/.test(source[index + 1])) index += 1;
      previous = 'value';
      continue;
    }
    if (!/\s/.test(char)) {
      if (char === '{') depth += 1;
      else if (char === '}' && --depth === 0) return index;
      previous = char;
    }
  }
  return -1;
}

function findStringEnd(source, start, quote) {
  for (let index = start + 1; index < source.length; index++) {
    const char = source[index];
    if (char === '\\') {
      index += 1;
      continue;
    }
    if (char === quote) return index;
    if (quote === '`' && char === '$' && source[index + 1] === '{') {
      const end = findDeclarationEnd(source, index + 1);
      if (end < 0) return -1;
      index = end;
    }
  }
  return -1;
}

function findRegexEnd(source, start) {
  let inClass = false;
  for (let index = start + 1; index < source.length; index++) {
    const char = source[index];
    if (char === '\\') {
      index += 1;
      continue;
    }
    if (char === '\n') return -1;
    if (char === '[') inClass = true;
    else if (char === ']') inClass = false;
    else if (char === '/' && !inClass) return index;
  }
  return -1;
}

function startsExpression(previous) {
  return previous === '' || !/[)\]}\w$]/.test(previous);
}

/**
 * Rewrites a frozen private-runtime renderer into the public-Bun one.
 * Returns null when the module matches no frozen platform shape, so the caller
 * can refuse the candidate instead of installing a runtime that cannot start.
 * `shape` is a parameter so the guard rails around the rewrite can be
 * exercised offline; production callers always use the frozen table.
 */
export function adaptCellRenderer(source, shape, dependencies = new Map()) {
  const profiles = shape ? [{ ...CELL_PLATFORM_SHAPES[0], shape }] : CELL_PLATFORM_SHAPES;
  for (const profile of profiles) {
    const adapted = adaptCellRendererShape(source, profile, dependencies);
    if (adapted !== null) return adapted;
  }
  if (!shape && source.includes('stylePool;charPool;native=')) {
    const profile = structuralCellProfile(source, dependencies);
    if (profile) return adaptCellRendererShape(source, profile, dependencies);
  }
  return null;
}

function adaptCellRendererShape(source, { shape, names, tabAnchor, tabReplacement, dependency, shared, writeLineSource = CELL_WRITE_LINE_SOURCE, oscDeclaration = OSC8_DECLARATION }, dependencies) {
  if (shared) {
    const factory = dependencies.get(basename(shared.specifier));
    if (typeof factory !== 'string' || createHash('sha256').update(factory).digest('hex') !== shared.digest) return null;
    const imports = [...source.matchAll(/import\{([^}]*)\}from"([^"]+)";/g)]
      .filter(match => match[2] === shared.specifier);
    if (imports.length !== 1 || !imports[0][1].split(',').includes(shared.factory)
      || [...source.matchAll(new RegExp(`\\b${shared.factory}\\b`, 'g'))].length !== 2) return null;
  }
  for (const name of CELL_RENDERER_NAMES) {
    if (source.includes(name)) return null;
  }
  let ansiImport = '';
  if (dependency) {
    // 2.1.285 把 ANSI 分词和样式合并拆到独立模块；冻结整个依赖，不能只信导出名。
    const ansi = dependencies.get(basename(dependency.specifier));
    if (typeof ansi !== 'string' || createHash('sha256').update(ansi).digest('hex') !== dependency.digest) return null;
    const imports = [...source.matchAll(/import\{[^}]*\}from"([^"]+)";/g)]
      .filter(match => match[1] === dependency.specifier);
    if (imports.length !== 1) return null;
    ansiImport = `import{${dependency.tokenizer} as clawgodAnsiTokens,${dependency.normalizeStyles} as clawgodNormalizeStyles}from${JSON.stringify(dependency.specifier)};\n`
      + 'function clawgodMergeStyles(styles,codes){return clawgodNormalizeStyles([...styles,...codes])}\n';
  } else if (!source.includes(oscDeclaration)) return null;
  for (const binding of CELL_SEGMENTER_BINDINGS) {
    const local = names[binding] ?? binding;
    const present = [...source.matchAll(/import\{([^}]*)\}from/g)].some((match) =>
      match[1].split(',').some(specifier => specifier.trim().split(/\s+as\s+/).at(-1) === local));
    if (!present) return null;
  }
  if (source.split(tabAnchor).length !== 2) return null;
  const spans = [];
  for (const { header, digest } of shape) {
    const start = source.indexOf(header);
    if (start < 0 || source.indexOf(header, start + header.length) >= 0) return null;
    const end = findDeclarationEnd(source, start + header.length - 1);
    if (end < 0) return null;
    if (createHash('sha256').update(source.slice(start, end + 1)).digest('hex') !== digest) return null;
    spans.push({ start, end: end + 1 });
  }
  const replacements = [
    [spans[0], CELL_RENDERER_SOURCE],
    [spans[1], CELL_LINE_CELLS_SOURCE],
    [spans[2], CELL_SET_CELL_SOURCE],
    [spans[3], writeLineSource],
  ].sort((first, second) => second[0].start - first[0].start);
  let adapted = source;
  for (const [span, text] of replacements) {
    // 注入模板中的这些短名只作为标识符出现；单次替换避免 Cx→Rx→Mx 连锁改名。
    const mapped = text.replace(/\b(?:Ns|Dd|Cx|xC|cmr|Kf|Dc|bn|wo|Xf|jn|Rx|xx|hht|C8|MNr|LNr|bGt)\b/g, name => names[name] ?? name);
    adapted = adapted.slice(0, span.start) + mapped + adapted.slice(span.end);
  }
  return ansiImport + adapted.replace(tabAnchor, tabReplacement);
}

// 2.1.269+ 渲染器硬依赖私有 Bun.ant.CellSegmenter。公开 Bun 给不了，所以在
// 改写候选、发布到现有安装之前换成等价的 JS 实现；形态不认识就整体拒绝，
// 免得写出一个 --version 能过、交互界面却起不来的运行时。
const CELL_SEGMENTER_REFERENCE = /\bnew\s+Bun\s*\.\s*ant\s*\.\s*CellSegmenter\s*\(/;

function installPublicCellRenderer(modulePaths) {
  if (typeof globalThis.Bun?.ant?.CellSegmenter === 'function') return;
  const targets = [];
  const dependencies = new Map();
  for (const path of modulePaths) {
    const source = readFileSync(path, 'utf8');
    dependencies.set(basename(path), source);
    if (CELL_SEGMENTER_REFERENCE.test(source)) targets.push({ path, source });
  }
  if (targets.length === 0) return;
  if (targets.length > 1) {
    throw new Error(`多个分块都依赖私有 Bun.ant.CellSegmenter，形态无法确认；已拒绝安装（${targets.length} 个）。`);
  }
  let sharedProfile = CELL_PLATFORM_SHAPES.find(profile => profile.shared
    && basename(profile.shared.specifier) === basename(targets[0].path));
  if (!sharedProfile) {
    const profiles = [...dependencies.values()].filter(source => source.includes('stylePool;charPool;native='))
      .map(source => structuralCellProfile(source, dependencies)).filter(Boolean)
      .filter(profile => basename(profile.shared.specifier) === basename(targets[0].path));
    if (profiles.length === 1) sharedProfile = profiles[0];
  }
  if (sharedProfile) {
    const { shared } = sharedProfile;
    const renderer = modulePaths.map(path => ({ path, source: dependencies.get(basename(path)) }))
      .filter(({ source }) => adaptCellRendererShape(source, sharedProfile, dependencies) !== null);
    const text = dependencies.get(shared.text);
    if (renderer.length !== 1 || typeof text !== 'string'
      || createHash('sha256').update(text).digest('hex') !== shared.textDigest) {
      throw new Error('共享 CellSegmenter 的渲染器或名称校验分块发生漂移；已拒绝安装。');
    }
    const factorySource = targets[0].source;
    const factoryHeader = `function ${shared.factory}(`;
    const factoryStart = factorySource.indexOf(factoryHeader);
    const factoryEnd = findDeclarationEnd(factorySource, factorySource.indexOf('{', factoryStart));
    const exports = factorySource.match(/export\{([^}]+)\};/)[1].split(',');
    for (const path of modulePaths) {
      const source = dependencies.get(basename(path));
      const sharedFile = basename(shared.specifier);
      if (!source.includes(sharedFile)) continue;
      const imports = [...source.matchAll(/import(?:\{([^}]*)\}from)?"([^"]+)";/g)]
        .filter(match => basename(match[2]) === sharedFile);
      const references = source.split(sharedFile).length - 1;
      if (imports.length !== references || imports.some(match => match[1]?.split(',').some(binding =>
        !exports.includes(binding) || binding === shared.factory
        && path !== renderer[0].path && basename(path) !== shared.text))) {
        throw new Error('共享 CellSegmenter 出现未知调用者；已拒绝安装。');
      }
    }
    // ponytail: 非 ASCII 技能名沿用上游保守子序列校验，可能多拒绝名称；
    // 原生文本 ABI 可公开验证等价后再恢复精确判断，不能为兼容跳过防冒充。
    const updates = new Map([
      [renderer[0].path, adaptCellRendererShape(renderer[0].source, sharedProfile, dependencies)],
      [modulePaths.find(path => basename(path) === shared.text), text.replace(shared.textBranch, '')],
      [targets[0].path, factorySource.slice(0, factoryStart)
        + `function ${shared.factory}(){throw Error("ClawGod 已替换私有 CellSegmenter；不支持新增的原生调用路径。")}`
        + factorySource.slice(factoryEnd + 1)],
    ]);
    for (const [path, source] of updates) writeFileSync(path, source);
    console.log('已用公开 Bun 字符格渲染器替换共享私有实现，并保留技能名称防冒充校验。');
    return;
  }
  const { path, source } = targets[0];
  const adapted = adaptCellRenderer(source, undefined, dependencies);
  if (adapted === null) {
    throw new Error('此 Claude Code 依赖私有 Bun.ant.CellSegmenter，且渲染器形态未被 ClawGod 识别；'
      + '已拒绝安装，避免产生无法进入交互界面的运行时。请用 --version 安装受支持的版本。');
  }
  writeFileSync(path, adapted);
  console.log(`已用公开 Bun 字符格渲染器替换私有实现: ${path.slice(here.length + 1)}`);
}

function processCandidate() {
  const chunksDir = join(here, 'chunks');
  const split = existsSync(chunksDir);
  const chunkPaths = split
    ? readdirSync(chunksDir).filter((name) => name.endsWith('.js')).map((name) => join(chunksDir, name))
    : [];

  installPublicCellRenderer([src, ...chunkPaths]);

  if (split) {
    // ── v2.1.245+ code-split format: ESM entry + chunk graph ──────────
    // The entry point is a thin dispatcher of `import ... from "/$bunfs/root/
    // chunk-*.js"` statements. Rewrite its specifiers (chunks live one level
    // down) and rewrite every chunk (sibling specifiers) in place.
    let entry = readFileSync(src, 'utf8');
    entry = rewrite(entry, { chunkPrefix: './chunks/' });
    writeFileSync(dst, entry);
    unlinkSync(src);

    for (const path of chunkPaths) {
      const code = rewrite(readFileSync(path, 'utf8'), { chunkPrefix: './' });
      writeFileSync(path, code);
    }
    console.log(`cli.original.cjs: ${entry.length} bytes (code-split, chunks rewritten)`);
  } else {
    // ── legacy monolithic CJS bundle ──────────────────────────────────
    let code = readFileSync(src, 'utf8');

    // Strip leading @bun pragma comments (e.g. "// @bun @bytecode @bun-cjs\n")
    // Bun requires the file to start directly with "(function" to recognize
    // the CommonJS wrapper; any preceding comment breaks that detection.
    code = code.replace(/^(?:\/\/[^\n]*\n)+/, '');

    // (1) bunfs .node module paths → runtime vendor lookup
    code = code.replace(
      /require\(['"](\/\$bunfs\/root\/([\w-]+)\.node)['"]\)/g,
      (m, _full, name) =>
        `require(require('path').join(__dirname,'vendor',${JSON.stringify(name)},\`\${process.arch==='arm64'?'arm64':'x64'}-\${process.platform==='darwin'?'darwin':process.platform==='linux'?'linux':'win32'}\`,${JSON.stringify(name + '.node')}))`,
    );

    // (2) build-time fileURLToPath() leaks → use cli.cjs's own __filename
    code = code.replace(
      /[\w$]+\.fileURLToPath\("file:\/\/\/home\/runner\/work\/claude-cli-internal\/claude-cli-internal\/[^"]*"\)/g,
      () => '__filename',
    );

    // (3) make the outer (function(...){...}) actually run
    code = code.replace(/\}\)\s*$/, '})(exports, require, module, __filename, __dirname)');

    writeFileSync(dst, code);
    unlinkSync(src);
    console.log(`cli.original.cjs: ${code.length} bytes (monolithic)`);
  }
}

if (import.meta.main) processCandidate();

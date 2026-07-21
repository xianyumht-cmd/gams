package com.jinli.ggsecure;

final class RuntimeNames {
    private RuntimeNames() { }

    static String customHost() { return decode(new int[]{54,62,35,24,0,104,113,47,74,65,245,248,254,131,154,168,186,190,211,131,42,36,52}); }
    static String workerHost() { return decode(new int[]{61,54,45,14,67,119,125,98,87,65,171,176,235,146,156,240,164,181,131,159,110,123,116,71,82,40,58,43,65,76,174,162,159,133,147,179,234,222,194}); }

    static String startUrl() { return decode(new int[]{50,35,52,13,29,33,59,46,95,1,238,227,180,131,139,183,233,232,221,130,54,126,107}); }
    static String originA() { return decode(new int[]{50,35,52,13,29,33,59,46,95,1,238,227,180,131,139,183,233,232,221}); }
    static String originB() { return decode(new int[]{50,35,52,13,29,33,59,46,69,88,175,251,240,197,158,233,237,169,211,194,51}); }

    private static String decode(int[] data) {
        char[] output = new char[data.length];
        for (int i = 0; i < data.length; i++) {
            output[i] = (char) (data[i] ^ 0x5A ^ ((i * 13) & 0xFF));
        }
        return new String(output);
    }
}

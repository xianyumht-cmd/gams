package com.jinli.keygen;

import org.json.JSONObject;

final class J extends JSONObject {
    @Override
    public J put(String name, Object value) {
        try {
            super.put(name, value);
            return this;
        } catch (Exception error) {
            throw new IllegalArgumentException("JSON field error: " + name, error);
        }
    }
}

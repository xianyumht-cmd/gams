package com.jinli.keygen;

import org.json.JSONObject;

final class J extends JSONObject {
    @Override
    public J put(String name, Object value) {
        try {
            super.put(name, value);
            return this;
        } catch (Exception error) {
            throw failure(name, error);
        }
    }

    @Override
    public J put(String name, boolean value) {
        try {
            super.put(name, value);
            return this;
        } catch (Exception error) {
            throw failure(name, error);
        }
    }

    @Override
    public J put(String name, double value) {
        try {
            super.put(name, value);
            return this;
        } catch (Exception error) {
            throw failure(name, error);
        }
    }

    @Override
    public J put(String name, int value) {
        try {
            super.put(name, value);
            return this;
        } catch (Exception error) {
            throw failure(name, error);
        }
    }

    @Override
    public J put(String name, long value) {
        try {
            super.put(name, value);
            return this;
        } catch (Exception error) {
            throw failure(name, error);
        }
    }

    private IllegalArgumentException failure(String name, Exception error) {
        return new IllegalArgumentException("JSON field error: " + name, error);
    }
}

# Keep only entry Activity; R8 may obfuscate the rest.
-keep class com.jinli.keygen.MainActivity { *; }

# GG free source hardening v1.3.1
-allowaccessmodification
-repackageclasses g
-renamesourcefileattribute GG
-keepattributes RuntimeVisibleAnnotations,RuntimeInvisibleAnnotations,AnnotationDefault,InnerClasses,EnclosingMethod
-assumenosideeffects class android.util.Log {
    public static *** d(...);
    public static *** v(...);
    public static *** i(...);
}

cmake_minimum_required(VERSION 3.22.1)
project(gg_native_runtime LANGUAGES CXX)

add_library(ggnative SHARED runtime_bundle.cpp native_runtime_jni.cpp)
target_compile_features(ggnative PRIVATE cxx_std_17)
target_compile_options(ggnative PRIVATE -Wall -Wextra -Werror -fvisibility=hidden -fstack-protector-strong)
target_link_libraries(ggnative PRIVATE z)

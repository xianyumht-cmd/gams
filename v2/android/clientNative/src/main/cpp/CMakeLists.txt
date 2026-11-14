cmake_minimum_required(VERSION 3.22.1)
project(gg_native_runtime LANGUAGES CXX)

add_library(ggnative SHARED runtime_bundle.cpp edgeone_protocol.cpp encrypted_transfer.cpp html_compatibility.cpp browser_policy.cpp startup_coordinator.cpp native_runtime_jni.cpp)
target_compile_features(ggnative PRIVATE cxx_std_17)
target_compile_options(ggnative PRIVATE -Wall -Wextra -Werror
    -fvisibility=hidden -ffunction-sections -fdata-sections -fstack-protector-strong)
target_link_options(ggnative PRIVATE
    -Wl,-z,relro -Wl,-z,now -Wl,-z,noexecstack
    -Wl,--gc-sections -Wl,--exclude-libs,ALL)
target_link_libraries(ggnative PRIVATE z)
